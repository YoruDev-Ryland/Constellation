const { app, BrowserWindow, ipcMain, dialog, screen } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const Store = require('electron-store');
const crypto = require('crypto');
const os = require('os');
const { initAutoUpdater } = require('./auto-updater');
// Optional auth dependencies (lazy)
let axios;
let keytar;
try {
  axios = require('axios');
  keytar = require('keytar');
} catch (e) {
  console.warn('[auth] axios/keytar not available (install to enable Starloch auth):', e?.message);
}

// For license validation HTTP requests
const https = require('https');
const { URL } = require('url');

const store = new Store();
let mainWindow;
let oauthWindow;

// --- Starloch Auth client setup ---
const AUTH_API_BASE = 'https://starloch.com/desktop-auth';
const AUTH_SERVICE = 'starloch-desktop';
const AUTH_KEYS = { access: 'access-token', refresh: 'refresh-token' };
let AUTH_API = null;

function ensureAuthApi() {
  if (!axios || !keytar) {
    console.warn('[ensureAuthApi] axios or keytar not available');
    return null;
  }
  if (AUTH_API) return AUTH_API;
  
  console.log('[ensureAuthApi] Creating axios instance for', AUTH_API_BASE);
  AUTH_API = axios.create({ baseURL: AUTH_API_BASE, timeout: 15000 });
  let refreshing = null;
  
  AUTH_API.interceptors.request.use(async (config) => {
    try {
      const token = await keytar.getPassword(AUTH_SERVICE, AUTH_KEYS.access);
      if (token) {
        console.log('[auth-request] Adding Bearer token to request:', config.method?.toUpperCase(), config.url);
        config.headers = { ...(config.headers || {}), Authorization: `Bearer ${token}` };
      } else {
        console.log('[auth-request] No access token found for request:', config.method?.toUpperCase(), config.url);
      }
    } catch (err) {
      console.error('[auth-request] Error getting access token:', err.message);
    }
    return config;
  });
  
  AUTH_API.interceptors.response.use(undefined, async (error) => {
    const original = error.config || {};
    if (error.response?.status === 401 && !original._retry) {
      console.log('[auth-response] 401 received, attempting refresh for:', original.url);
      original._retry = true;
      if (!refreshing) {
        refreshing = (async () => {
          const refresh = await keytar.getPassword(AUTH_SERVICE, AUTH_KEYS.refresh);
          // If there's no refresh token, propagate the original 401 without throwing a new error
          if (!refresh) {
            console.warn('[auth-response] No refresh token available, clearing stale access token');
            // Optionally clear any stale access token
            try { await keytar.deletePassword(AUTH_SERVICE, AUTH_KEYS.access); } catch {}
            throw error; // Keep the original 401 so callers can handle as Unauthorized
          }
          console.log('[auth-response] Attempting token refresh...');
          const { data } = await AUTH_API.post('/refresh', { refresh_token: refresh });
          const newAccess = data?.token || data?.access_token || data?.access || data?.jwt;
          const newRefresh = data?.refresh_token || data?.refresh || data?.refreshToken;
          if (!newAccess) {
            console.error('[auth-response] Refresh response missing access token:', data);
            throw new Error('Refresh failed');
          }
          console.log('[auth-response] Token refresh successful, saving new tokens');
          await keytar.setPassword(AUTH_SERVICE, AUTH_KEYS.access, newAccess);
          if (newRefresh) await keytar.setPassword(AUTH_SERVICE, AUTH_KEYS.refresh, newRefresh);
          return newAccess;
        })().finally(() => { refreshing = null; });
      }
      const newAccess = await refreshing;
      original.headers = original.headers || {};
      original.headers.Authorization = `Bearer ${newAccess}`;
      console.log('[auth-response] Retrying original request with new token');
      return AUTH_API(original);
    }
    throw error;
  });
  return AUTH_API;
}


function createWindow() {
  // Get the primary display and cursor position to determine active monitor
  const activeDisplay = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  
  // Calculate center position on the active display
  const { x, y, width, height } = activeDisplay.workArea;
  const windowWidth = 1400;
  const windowHeight = 900;
  
  mainWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    minWidth: 1200,
    minHeight: 700,
    x: Math.round(x + (width - windowWidth) / 2),
    y: Math.round(y + (height - windowHeight) / 2),
    backgroundColor: '#0a0e17',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    titleBarStyle: 'hiddenInset',
    frame: false
  });

  // Check if first run
  const isFirstRun = !store.has('settings.storagePath');
  
  if (isFirstRun) {
    mainWindow.loadFile('renderer/setup.html');
  } else {
    mainWindow.loadFile('renderer/index.html');
  }

  // Initialize auto-updater after window is created
  mainWindow.webContents.on('did-finish-load', () => {
    initAutoUpdater(mainWindow);
  });

  // Uncomment the line below if you need developer tools for debugging by default
  // mainWindow.webContents.openDevTools();
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC Handlers
ipcMain.handle('get-settings', () => {
  return store.get('settings', {});
});

ipcMain.handle('save-settings', (event, settings) => {
  store.set('settings', settings);
  return true;
});

ipcMain.handle('select-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('scan-directory', async (event, dirPath) => {
  try {
    const settings = store.get('settings', {});
    const ignoreFolders = settings.ignoreFolders || [];
    return await scanDirectory(dirPath, [], 0, ignoreFolders);
  } catch (error) {
    console.error('Error scanning directory:', error);
    return { error: error.message };
  }
});

ipcMain.handle('read-fits-header', async (event, filePath) => {
  try {
    // FITS headers are in 2880-byte blocks
    // Read first 10 blocks (28800 bytes) which should contain the full header
    const headerSize = 10 * 2880; // 28800 bytes
    const fileHandle = await fs.open(filePath, 'r');
    const buffer = Buffer.alloc(headerSize);
    const { bytesRead } = await fileHandle.read(buffer, 0, headerSize, 0);
    await fileHandle.close();
    
    return parseFitsHeader(buffer.slice(0, bytesRead));
  } catch (error) {
    console.error('Error reading FITS header:', error);
    return null;
  }
});

// Local helper for reading a FITS header (used internally below)
async function readFitsHeaderLocal(filePath) {
  // Same logic as the handler, but reusable internally
  const headerSize = 10 * 2880;
  const fileHandle = await fs.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(headerSize);
    const { bytesRead } = await fileHandle.read(buffer, 0, headerSize, 0);
    return parseFitsHeader(buffer.slice(0, bytesRead));
  } finally {
    await fileHandle.close();
  }
}

ipcMain.handle('rename-folder', async (event, oldPath, newName) => {
  try {
    const parentDir = path.dirname(oldPath);
    const newPath = path.join(parentDir, newName);
    await fs.rename(oldPath, newPath);
    return { success: true, newPath };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('delete-folder', async (event, folderPath) => {
  try {
    await fs.rm(folderPath, { recursive: true, force: true });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-projects', async () => {
  try {
    const settings = store.get('settings', {});
    if (!settings.storagePath) return [];
    const dbPath = path.join(settings.storagePath, '.constellation');
    try {
      const data = await fs.readFile(dbPath, 'utf8');
      const json = JSON.parse(data);
      return json.projects || [];
    } catch {
      return [];
    }
  } catch (e) {
    console.error('get-projects failed:', e);
    return [];
  }
});

ipcMain.handle('save-projects', async (event, projects) => {
  try {
    const settings = store.get('settings', {});
    if (!settings.storagePath) return false;
    const dbPath = path.join(settings.storagePath, '.constellation');
    let existing = {};
    try { existing = JSON.parse(await fs.readFile(dbPath, 'utf8')); } catch {/* ignore */}
    const dbData = {
      version: existing.version || '1.0',
      lastScan: existing.lastScan || new Date().toISOString(),
      targets: existing.targets || [],
      scanLog: existing.scanLog || [],
      projects
    };
    await fs.writeFile(dbPath, JSON.stringify(dbData, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error('save-projects failed:', e);
    return false;
  }
});

ipcMain.handle('complete-setup', () => {
  mainWindow.loadFile('renderer/index.html');
});

ipcMain.handle('open-settings', () => {
  // Instead of loading a new file, we'll send a message to show settings overlay
  mainWindow.webContents.send('show-settings-modal');
});

ipcMain.handle('window-control', (event, action) => {
  switch(action) {
    case 'minimize':
      mainWindow.minimize();
      break;
    case 'maximize':
      mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
      break;
    case 'close':
      mainWindow.close();
      break;
  }
});

// Database operations
ipcMain.handle('load-library-database', async () => {
  try {
    const settings = store.get('settings', {});
    if (!settings.storagePath) return null;
    
    const dbPath = path.join(settings.storagePath, '.constellation');
    const data = await fs.readFile(dbPath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    // Database doesn't exist yet or is corrupted
    console.log('No existing database found, starting fresh');
    return null;
  }
});

ipcMain.handle('save-library-database', async (event, data) => {
  try {
    const settings = store.get('settings', {});
    if (!settings.storagePath) return { success: false, error: 'No storage path set' };
    
    const dbPath = path.join(settings.storagePath, '.constellation');
    const dbData = {
      version: '1.0',
      lastScan: new Date().toISOString(),
      ...data
    };
    
    await fs.writeFile(dbPath, JSON.stringify(dbData, null, 2), 'utf8');
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Thumbnail operations
ipcMain.handle('find-project-thumbnail', async (event, projectName, storagePath) => {
  try {
    
    // Look for project folder in storage path
    const projectFolders = await findProjectFolders(storagePath, projectName);
    
    for (const projectFolder of projectFolders) {
      const thumbnail = await findNewestJpgInDirectory(projectFolder);
      if (thumbnail) {
        return { success: true, thumbnailPath: thumbnail };
      }
    }
    
    return { success: false, error: 'No JPG files found' };
  } catch (error) {
    console.error('Error in find-project-thumbnail:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('select-custom-thumbnail', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Project Thumbnail',
    properties: ['openFile'],
    filters: [
      { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'bmp', 'webp'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('copy-thumbnail-to-project', async (event, sourcePath, projectName, storagePath) => {
  try {
    const settings = store.get('settings', {});
    const thumbnailsDir = path.join(storagePath, '.constellation-thumbnails');
    
    // Create thumbnails directory if it doesn't exist
    await fs.mkdir(thumbnailsDir, { recursive: true });
    
    // Generate safe filename
    const ext = path.extname(sourcePath);
    const safeProjectName = projectName.replace(/[^a-zA-Z0-9-_]/g, '_');
    const thumbnailPath = path.join(thumbnailsDir, `${safeProjectName}${ext}`);
    
    // Copy file
    await fs.copyFile(sourcePath, thumbnailPath);
    
    return { success: true, thumbnailPath };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Fetch a thumbnail for a project name from NASA Images API as a minimal default
ipcMain.handle('fetch-project-thumbnail', async (event, projectName, storagePath) => {
  try {
    if (!projectName || !storagePath) return { success: false, error: 'Missing args' };
    const thumbnailsDir = path.join(storagePath, '.constellation-thumbnails');
    await fs.mkdir(thumbnailsDir, { recursive: true });

    // Simple search using NASA Images API
    const query = encodeURIComponent(projectName);
    const apiUrl = `https://images-api.nasa.gov/search?q=${query}&media_type=image`;

    const resp = await new Promise((resolve, reject) => {
      https.get(apiUrl, (res) => {
        let body = '';
        res.on('data', (chunk) => body += chunk);
        res.on('end', () => resolve({ statusCode: res.statusCode, body }));
      }).on('error', (e) => reject(e));
    });

    if (!resp || resp.statusCode !== 200) return { success: false, error: 'NASA API request failed' };
    let parsed = {};
    try { parsed = JSON.parse(resp.body); } catch (e) { return { success: false, error: 'Invalid NASA response' }; }

    const items = parsed.collection && Array.isArray(parsed.collection.items) ? parsed.collection.items : [];
    if (!items.length) return { success: false, error: 'No images found' };

    // Find an item with at least one link that's an image
    let imageUrl = null;
    for (const item of items) {
      if (item.links && Array.isArray(item.links)) {
        const l = item.links.find(x => x.href && /\.jpe?g|\.png$/i.test(x.href));
        if (l) { imageUrl = l.href; break; }
      }
      // fallback: check in hrefs within data
      if (item.href && typeof item.href === 'string') {
        imageUrl = item.href; break;
      }
    }

    if (!imageUrl) return { success: false, error: 'No suitable image link found' };

    // Download the image into thumbnailsDir
    const ext = path.extname(new URL(imageUrl).pathname) || '.jpg';
    const safeName = projectName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const destPath = path.join(thumbnailsDir, `${safeName}${ext}`);

    const fileData = await new Promise((resolve, reject) => {
      https.get(imageUrl, (res) => {
        if (res.statusCode !== 200) return reject(new Error('Bad image response: ' + res.statusCode));
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      }).on('error', (e) => reject(e));
    });

    await fs.writeFile(destPath, fileData);

    return { success: true, thumbnailPath: destPath, source: 'nasa' };
  } catch (error) {
    console.error('fetch-project-thumbnail failed:', error);
    return { success: false, error: error.message };
  }
});

// Scan project folder for actual file data
ipcMain.handle('scan-project-files', async (event, projectName, storagePath) => {
  try {
    const projectFolders = await findProjectFolders(storagePath, projectName);
    if (projectFolders.length === 0) {
      return { success: true, sessions: [], debug: { reason: 'no-project-folders', projectName } };
    }

    const fileData = [];
    const debugFolders = [];
    for (const projectFolder of projectFolders) {
      const files = await scanProjectFolder(projectFolder);
      fileData.push(...files);
      debugFolders.push({ folder: projectFolder, filesFound: files.length });
    }

    const sessions = groupFilesBySession(fileData);
    if (sessions.length === 0) {
      return { success: true, sessions: [], debug: { reason: 'no-sessions-derived', examined: fileData.length, scannedFolders: debugFolders, sample: fileData.slice(0,5).map(f=>({filename:f.filename, dateObs:f.dateObs, filter:f.filter, exposure:f.exposure})), missingDateObs: fileData.filter(f=>!f.dateObs).length } };
    }
    return { success: true, sessions, debug: { scannedFolders: debugFolders } };
  } catch (error) {
    console.error('Error scanning project files:', error);
    return { success: false, error: error.message };
  }
});

// List JPG/JPEG files inside a project folder recursively and return {path, mtime}
ipcMain.handle('list-project-images', async (event, projectPath) => {
  try {
    const results = [];
    async function walk(dir, depth = 0) {
      if (depth > 10) return;
      let entries;
      try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name.startsWith('.')) continue;
          await walk(full, depth + 1);
        } else if (entry.isFile() && /\.(jpe?g)$/i.test(entry.name)) {
          try {
            const stats = await fs.stat(full);
            results.push({ path: full, mtime: stats.mtime.getTime() });
          } catch (e) { /* ignore */ }
        }
      }
    }

    await walk(projectPath, 0);
    return results;
  } catch (error) {
    console.error('list-project-images failed:', error);
    return [];
  }
});

// List JPG/JPEG files for a project by name within a storagePath: uses findProjectFolders
ipcMain.handle('list-project-images-for-project', async (event, projectName, storagePath) => {
  try {
    if (!projectName || !storagePath) {
      return [];
    }
    const folders = await findProjectFolders(storagePath, projectName);
    const results = [];
    for (const folder of folders) {
      // reuse the walker used by list-project-images
      async function walk(dir, depth = 0) {
        if (depth > 10) return;
        let entries;
        try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
        for (const entry of entries) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            if (entry.name.startsWith('.')) continue;
            await walk(full, depth + 1);
          } else if (entry.isFile() && /\.(jpe?g)$/i.test(entry.name)) {
            try { 
              const stats = await fs.stat(full); 
              results.push({ path: full, mtime: stats.mtime.getTime() });
            } catch (e) { }
          }
        }
      }
      await walk(folder, 0);
    }
    return results;
  } catch (error) {
    console.error('list-project-images-for-project failed:', error);
    return [];
  }
});

// Calendar images: return a mapping of date -> latest JPG path among all project folders
// Now with intelligent caching to avoid repeated filesystem scans
ipcMain.handle('get-calendar-images', async (event, storagePath, forceRefresh = false) => {
  try {
    const settings = store.get('settings', {});
    if (!settings.storagePath) return { success: false, error: 'No storage path configured' };
    
    const dbPath = path.join(settings.storagePath, '.constellation');
    let dbData = {};
    
    // Load existing database
    try {
      const data = await fs.readFile(dbPath, 'utf8');
      dbData = JSON.parse(data);
    } catch {
      dbData = { version: '1.0', calendarImages: { lastScan: null, dateToImage: {} } };
    }
    
    // Check if we need to refresh the cache
    const calendarCache = dbData.calendarImages || { lastScan: null, dateToImage: {} };
    const lastScanTime = calendarCache.lastScan ? new Date(calendarCache.lastScan) : null;
    const now = new Date();
    const cacheAge = lastScanTime ? (now - lastScanTime) / (1000 * 60 * 60) : Infinity; // hours
    
    // Refresh if forced, cache is older than 6 hours, or no cache exists
    if (forceRefresh || cacheAge > 6 || !lastScanTime) {
      const dateToImage = {}; // { 'YYYY-MM-DD': { path, mtime } }

      async function walk(dir, depth = 0) {
        if (depth > 4) return; // avoid deep recursion
        let entries;
        try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            if (entry.name.startsWith('.')) continue;
            await walk(fullPath, depth + 1);
          } else if (entry.isFile() && /\.(jpe?g)$/i.test(entry.name)) {
            try {
              const stats = await fs.stat(fullPath);
              const dateKey = stats.mtime.toISOString().split('T')[0];
              const existing = dateToImage[dateKey];
              if (!existing || stats.mtime > existing.mtime) {
                dateToImage[dateKey] = { path: fullPath, mtime: stats.mtime };
              }
            } catch {/* ignore */}
          }
        }
      }

      await walk(storagePath);
      
      // Update database with new cache
      dbData.calendarImages = {
        lastScan: now.toISOString(),
        dateToImage
      };
      
      // Save updated database
      await fs.writeFile(dbPath, JSON.stringify(dbData, null, 2), 'utf8');
    } //else {
      //console.log(`Using cached calendar images (${cacheAge.toFixed(1)} hours old)`);
    //}
    
    const result = Object.fromEntries(
      Object.entries(dbData.calendarImages.dateToImage).map(([date, obj]) => [date, obj.path])
    );
    return { success: true, images: result, fromCache: cacheAge <= 6 };
  } catch (error) {
    console.error('Error getting calendar images:', error);
    return { success: false, error: error.message };
  }
});

// Helper functions
async function findProjectFolders(storagePath, projectName) {
  const folders = [];
  const seen = new Set();

  // Normalizer: strip non-alphanumeric and lowercase
  const normalize = s => (s || '').toString().toLowerCase().replace(/[^a-z0-9]/g, '');
  const searchNameNorm = normalize(projectName || '');
  if (!searchNameNorm) return [];

  async function searchDirectory(dirPath, depth = 0) {
    if (depth > 3) return; // Limit search depth

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const fullPath = path.join(dirPath, entry.name);
          const folderNameNorm = normalize(entry.name);

          if (folderNameNorm) {
            // Require a minimum length to avoid accidental single-character matches
            const minLen = 3;
            const matches = (
              folderNameNorm === searchNameNorm ||
              (searchNameNorm.length >= minLen && folderNameNorm.includes(searchNameNorm)) ||
              (folderNameNorm.length >= minLen && searchNameNorm.includes(folderNameNorm))
            );

            if (matches) {
              if (!seen.has(fullPath)) {
                seen.add(fullPath);
                folders.push(fullPath);
              }
              // Do not recurse into matched folder to avoid scanning the same files multiple times
              continue;
            }
          }

          // Continue searching subdirectories
          await searchDirectory(fullPath, depth + 1);
        }
      }
    } catch (error) {
      // Ignore permission errors and continue
    }
  }

  await searchDirectory(storagePath);
  return folders;
}

async function findNewestJpgInDirectory(dirPath) {
  try {
    let newestJpg = null;
    let newestTime = 0;
    
    async function searchForJpgs(currentDir, depth = 0) {
      if (depth > 2) return; // Limit depth for performance
      
      const entries = await fs.readdir(currentDir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        
        if (entry.isFile() && /\.(jpg|jpeg)$/i.test(entry.name)) {
          const stats = await fs.stat(fullPath);
          if (stats.mtime.getTime() > newestTime) {
            newestTime = stats.mtime.getTime();
            newestJpg = fullPath;
          }
        } else if (entry.isDirectory() && !entry.name.startsWith('.')) {
          await searchForJpgs(fullPath, depth + 1);
        }
      }
    }
    
    await searchForJpgs(dirPath);
    return newestJpg;
  } catch (error) {
    console.error('Error finding JPG files:', error);
    return null;
  }
}

async function scanDirectory(dirPath, results = [], depth = 0, ignoreFolders = []) {
  if (depth > 10) return results; // Prevent infinite recursion
  
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      
      if (entry.isDirectory()) {
        // Check if this folder should be ignored (case-insensitive)
        const shouldIgnore = ignoreFolders.some(ignore => 
          entry.name.toLowerCase() === ignore.toLowerCase() ||
          entry.name.toLowerCase().includes(ignore.toLowerCase())
        );
        
        if (!shouldIgnore) {
          await scanDirectory(fullPath, results, depth + 1, ignoreFolders);
        }
      } else if (entry.isFile() && 
                 (entry.name.toLowerCase().endsWith('.fit') || 
                  entry.name.toLowerCase().endsWith('.fits') ||
                  entry.name.toLowerCase().endsWith('.fts'))) {
        results.push(fullPath);
      }
    }
  } catch (error) {
    console.error(`Error scanning ${dirPath}:`, error);
  }
  
  return results;
}

function parseFitsHeader(buffer) {
  try {
    // Basic FITS header parsing
    const headerStr = buffer.slice(0, 2880).toString('ascii');
    const lines = headerStr.match(/.{80}/g) || [];
    
    const header = {};
    for (const line of lines) {
      if (line.startsWith('END ')) break;
      
      const match = line.match(/^(\w+)\s*=\s*(.+?)(?:\s+\/.*)?$/);
      if (match) {
        const key = match[1].trim();
        let value = match[2].trim();
        
        // Remove quotes
        if (value.startsWith("'") && value.includes("'", 1)) {
          value = value.substring(1, value.indexOf("'", 1)).trim();
        }
        
        header[key] = value;
      }
    }
    
    return header;
  } catch (error) {
    console.error('Error parsing FITS header:', error);
    return null;
  }
}

// Scan a project folder for .fits files and extract metadata
async function scanProjectFolder(folderPath) {
  const files = [];

  async function scanDirectory(dirPath, depth = 0) {
    if (depth > 3) return; // Limit depth
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isFile() && /\.(fits|fit|fts)$/i.test(entry.name)) {
          const stats = await fs.stat(fullPath);
          let header = null;
          try {
            // Read first several FITS blocks (up to 10 * 2880 = 28800 bytes) for header
            const fd = await fs.open(fullPath, 'r');
            const headerBlocks = Buffer.alloc(28800);
            const { bytesRead } = await fd.read(headerBlocks, 0, 28800, 0);
            await fd.close();
            header = parseFitsHeader(headerBlocks.slice(0, bytesRead));
          } catch (e) {
            console.warn('[scan-project-files] Failed to read FITS header for', entry.name, e.message);
          }

            // Derive metadata from header
          const dateObsRaw = header?.['DATE-OBS'] || header?.DATEOBS || null;
          let dateObj = null;
          if (dateObsRaw) {
            // Normalize fractional seconds if present
            const normalized = dateObsRaw.replace(/\s+/g,'').replace(/Z$/,'');
            const isoCandidate = /T/.test(normalized) ? normalized : null;
            if (isoCandidate) {
              const parsed = Date.parse(isoCandidate);
              if (!isNaN(parsed)) dateObj = new Date(parsed);
            }
            if (!dateObj) {
              // Attempt split if space separated
              const spaceMatch = dateObsRaw.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2}(?:\.\d+)?)/);
              if (spaceMatch) {
                const parsed = Date.parse(spaceMatch[1] + 'T' + spaceMatch[2]);
                if (!isNaN(parsed)) dateObj = new Date(parsed);
              }
            }
          }

          const exposure = parseFloat(header?.EXPTIME || header?.EXPOSURE || header?.EXPOS || '0') || 0;
          let headerFilter = header?.FILTER || header?.FILTNAME || header?.FILTER1 || null;
          if (headerFilter) headerFilter = headerFilter.toString().trim().toUpperCase();
          // Fallbacks
            const filenameFilter = extractFilterFromFilename(entry.name);
          const filter = headerFilter || filenameFilter || 'OSC';

          files.push({
            path: fullPath,
            filename: entry.name,
            mtime: stats.mtime,
            dateObs: dateObj ? dateObj.toISOString() : null,
            exposure,
            filter,
            size: stats.size
          });
        } else if (entry.isDirectory() && !entry.name.startsWith('.')) {
          await scanDirectory(fullPath, depth + 1);
        }
      }
    } catch (error) {
      console.error('Error scanning directory:', dirPath, error);
    }
  }

  await scanDirectory(folderPath);
  return files;
}

// Extract filter name from filename
function extractFilterFromFilename(filename) {
  // Common patterns: _L_, _R_, _G_, _B_, _H_, _O_, _S_
  const filterMatch = filename.match(/_([LRGBHOS])_/i);
  if (filterMatch) {
    return filterMatch[1].toUpperCase();
  }
  
  // Alternative patterns: L.fits, Red.fits, etc.
  const altMatch = filename.match(/[_\-\.]([LRGBHOS])[_\-\.]/i);
  if (altMatch) {
    return altMatch[1].toUpperCase();
  }
  
  // OSC pattern
  if (filename.includes('OSC') || filename.includes('osc')) {
    return 'OSC';
  }
  
  return null;
}

// Additional IPC handlers for Sub-Frame Analyzer

ipcMain.handle('select-file', async (event, options) => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: options.title || 'Select File',
      filters: options.filters || [],
      properties: ['openFile']
    });
    return result;
  } catch (error) {
    console.error('Error selecting file:', error);
    return { canceled: true, error: error.message };
  }
});

ipcMain.handle('select-folder', async (event, options) => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: options.title || 'Select Folder',
      properties: ['openDirectory']
    });
    return result;
  } catch (error) {
    console.error('Error selecting folder:', error);
    return { canceled: true, error: error.message };
  }
});

// Launch external program
ipcMain.handle('launch-program', async (event, programPath, args = []) => {
  try {
    console.log('[launch-program] Attempting to launch:', programPath, 'with args:', args);
    
    if (!programPath) {
      return { success: false, error: 'No program path provided' };
    }

    if (!fsSync.existsSync(programPath)) {
      return { success: false, error: 'Program file not found' };
    }

    const { spawn } = require('child_process');
    
    // Launch the program detached so it runs independently
    const child = spawn(programPath, args, {
      detached: true,
      stdio: 'ignore'
    });
    
    // Unreference so parent can exit
    child.unref();
    
    console.log('[launch-program] Successfully launched:', programPath, 'with args:', args);
    return { success: true };
    
  } catch (error) {
    console.error('[launch-program] Error launching program:', error);
    return { success: false, error: error.message };
  }
});

// --- Auth IPC ---
ipcMain.handle('auth-login', async (_event, creds) => {
  console.log('[auth-login] Login attempt for identifier:', creds?.identifier);
  try {
    const API = ensureAuthApi();
    if (!API) throw new Error('Auth not available. Please install axios and keytar.');
    if (!creds || !creds.identifier || !creds.password) throw new Error('Missing credentials');
    
    console.log('[auth-login] Sending login request to', AUTH_API_BASE + '/login');
    const response = await API.post('/login', { identifier: creds.identifier, password: creds.password });
    const data = response.data;
    
    console.log('[auth-login] Full response:', JSON.stringify(data, null, 2));
    console.log('[auth-login] Response analysis:', {
      hasToken: !!data?.token,
      hasAccessToken: !!data?.access_token,
      hasRefreshToken: !!data?.refresh_token,
      hasUser: !!data?.user,
      hasSuccess: !!data?.success,
      responseKeys: Object.keys(data || {}),
      dataType: typeof data
    });
    
    // Support multiple token field names from the API
    const accessToken = data?.token || data?.access_token || data?.access || data?.jwt || null;
    const refreshToken = data?.refresh_token || data?.refresh || data?.refreshToken || null;
    
    if (!accessToken) {
      console.error('[auth-login] No access token in response!');
      throw new Error('Login response missing access token');
    }
    
    console.log('[auth-login] Saving tokens to keytar...');
    await keytar.setPassword(AUTH_SERVICE, AUTH_KEYS.access, accessToken);
    if (refreshToken) {
      await keytar.setPassword(AUTH_SERVICE, AUTH_KEYS.refresh, refreshToken);
      console.log('[auth-login] Both access and refresh tokens saved');
    } else {
      console.log('[auth-login] Only access token saved (no refresh token in response)');
    }
    
    // Verify tokens were saved
    const savedAccess = await keytar.getPassword(AUTH_SERVICE, AUTH_KEYS.access);
    const savedRefresh = await keytar.getPassword(AUTH_SERVICE, AUTH_KEYS.refresh);
    console.log('[auth-login] Token verification - access:', !!savedAccess, 'refresh:', !!savedRefresh);
    
    console.log('[auth-login] Login successful for user:', data.user?.username || data.user?.email);
    return { success: true, user: data.user || null };
  } catch (error) {
    const msg = error?.response?.data?.message || error.message || 'Login failed';
    const status = error?.response?.status;
    console.error('[auth-login] ERROR:', {
      message: msg,
      status,
      hasResponse: !!error?.response,
      responseData: error?.response?.data
    });
    return { success: false, error: msg };
  }
});

ipcMain.handle('auth-me', async () => {
  console.log('[auth-me] Fetching current user info...');
  try {
    const API = ensureAuthApi();
    if (!API) throw new Error('Auth not available');
    
    // Check if we have a token
    const hasToken = !!(await keytar.getPassword(AUTH_SERVICE, AUTH_KEYS.access));
    console.log('[auth-me] Access token exists:', hasToken);
    
    const { data } = await API.get('/me');
    console.log('[auth-me] User data received:', {
      id: data?.id,
      username: data?.username,
      email: data?.email,
      keys: Object.keys(data || {})
    });
    return { success: true, user: data };
  } catch (error) {
    const status = error?.response?.status;
    console.log('[auth-me] ERROR:', {
      status,
      message: error.message,
      hasResponse: !!error?.response
    });
    if (status === 401) return { success: false, error: 'Unauthorized' };
    const msg = error?.response?.data?.message || error.message;
    return { success: false, error: msg };
  }
});

ipcMain.handle('auth-logout', async () => {
  console.log('[auth-logout] Logging out...');
  try {
    const API = ensureAuthApi();
    if (API) {
      try {
        const refresh = await keytar.getPassword(AUTH_SERVICE, AUTH_KEYS.refresh);
        if (refresh) {
          console.log('[auth-logout] Revoking refresh token on server...');
          await API.post('/logout', { refresh_token: refresh });
        }
      } catch (err) {
        console.warn('[auth-logout] Server-side logout failed:', err.message);
      }
    }
    if (keytar) {
      console.log('[auth-logout] Deleting local tokens...');
      try { await keytar.deletePassword(AUTH_SERVICE, AUTH_KEYS.access); } catch {}
      try { await keytar.deletePassword(AUTH_SERVICE, AUTH_KEYS.refresh); } catch {}
    }
    console.log('[auth-logout] Logout complete');
    return { success: true };
  } catch (error) {
    console.error('[auth-logout] ERROR:', error.message);
    return { success: false, error: error.message };
  }
});

// Get current auth token (for community API)
ipcMain.handle('get-auth-token', async () => {
  try {
    console.log('[get-auth-token] Retrieving access token from keytar');
    const accessToken = await keytar.getPassword(AUTH_SERVICE, AUTH_KEYS.access);
    
    if (!accessToken) {
      console.log('[get-auth-token] No access token found');
      return null;
    }
    
    console.log('[get-auth-token] Access token retrieved successfully');
    return accessToken;
  } catch (error) {
    console.error('[get-auth-token] Error:', error);
    return null;
  }
});

// Scan a folder directly for FITS files (for Sub-Frame Analyzer)
ipcMain.handle('scan-fits-folder', async (event, folderPath) => {
  try {
    console.log('[scan-fits-folder] Scanning folder:', folderPath);
    
    const entries = await fs.readdir(folderPath, { withFileTypes: true });
    const fitsFiles = [];
    
    for (const entry of entries) {
      if (entry.isFile() && entry.name.toLowerCase().match(/\.(fits|fit|fts)$/i)) {
        const filePath = path.join(folderPath, entry.name);
        
        try {
          // Try to read FITS header using local helper
          const header = await readFitsHeaderLocal(filePath);
          
          fitsFiles.push({
            name: entry.name,
            path: filePath,
            header: header
          });
        } catch (error) {
          console.warn('[scan-fits-folder] Failed to read FITS header for', entry.name, error.message);
          // Still include the file even if header reading fails
          fitsFiles.push({
            name: entry.name,
            path: filePath,
            header: null
          });
        }
      }
    }
    
    console.log(`[scan-fits-folder] Found ${fitsFiles.length} FITS files`);
    return { success: true, files: fitsFiles };
    
  } catch (error) {
    console.error('Error scanning FITS folder:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('create-directory', async (event, dirPath) => {
  try {
    await fs.mkdir(dirPath, { recursive: true });
    return { success: true };
  } catch (error) {
    console.error('Error creating directory:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('copy-file', async (event, sourcePath, destPath) => {
  try {
    await fs.copyFile(sourcePath, destPath);
    return { success: true };
  } catch (error) {
    console.error('Error copying file:', error);
    return { success: false, error: error.message };
  }
});

// Analyze stars in a FITS file by reading a central crop and measuring shapes
ipcMain.handle('analyze-fits-stars', async (event, filePath, options = {}) => {
  const cropSize = options.cropSize || 768; // default square tile size
  const kSigma = options.kSigma || 4.0;    // raise default to reduce noise picks
  try {
    const fd = await fs.open(filePath, 'r');

    // Read header blocks until END keyword
    let headerBlocks = Buffer.alloc(0);
    const blockSize = 2880;
    let cursor = 0;
    while (true) {
      const buf = Buffer.alloc(blockSize);
      const { bytesRead } = await fd.read(buf, 0, blockSize, cursor);
      if (bytesRead === 0) break;
      headerBlocks = Buffer.concat([headerBlocks, buf.slice(0, bytesRead)]);
      cursor += bytesRead;
      if (buf.toString('ascii').includes('END')) {
        // FITS headers are padded to full 2880 byte block after END
        break;
      }
      if (cursor > 28800 * 4) break; // safety cap (~115KB)
    }

    // Parse header across all read bytes
    const headerStr = headerBlocks.toString('ascii');
    const cards = headerStr.match(/.{1,80}/g) || [];
    const header = {};
    let endIndex = -1;
    for (let i = 0; i < cards.length; i++) {
      const line = cards[i];
      if (!line) continue;
      if (line.startsWith('END')) { endIndex = i; break; }
      const m = line.match(/^(\w+)\s*=\s*(.+?)(?:\s*\/.*)?$/);
      if (m) {
        const key = m[1].trim();
        let value = m[2].trim();
        if (value.startsWith("'") && value.indexOf("'", 1) > 0) {
          value = value.substring(1, value.indexOf("'", 1));
        } else if (/^[+-]?\d+(?:\.\d+)?$/.test(value)) {
          value = Number(value);
        }
        header[key] = value;
      }
    }
    const headerCards = endIndex >= 0 ? (endIndex + 1) : cards.length;
    const headerLenBytes = Math.ceil((headerCards * 80) / blockSize) * blockSize;

    const width = Number(header.NAXIS1) || 0;
    const height = Number(header.NAXIS2) || 0;
    const bitpix = Number(header.BITPIX) || 16;
    const bscale = header.BSCALE ? Number(header.BSCALE) : 1.0;
    const bzero = header.BZERO ? Number(header.BZERO) : 0.0;
    if (!width || !height) {
      await fd.close();
      return { success: false, error: 'Invalid FITS dimensions' };
    }

    const bytesPerPixel = (bitpix === 8) ? 1 : (Math.abs(bitpix) === 16 ? 2 : (Math.abs(bitpix) === 32 ? 4 : null));
    const readFloat = (buffer, offset) => {
      if (bitpix === -32) return buffer.readFloatBE(offset);
      if (bitpix === 8) return buffer.readUInt8(offset);
      if (bitpix === 16) return buffer.readInt16BE(offset);
      if (bitpix === 32) return buffer.readInt32BE(offset);
      return buffer.readInt16BE(offset);
    };
    if (!bytesPerPixel) {
      await fd.close();
      return { success: false, error: `Unsupported BITPIX ${bitpix}` };
    }

    const dataOffset = headerLenBytes; // primary HDU only

    // Tile reader helper
    const rowStrideBytes = width * bytesPerPixel;
    async function readTile(x0, y0, tw, th) {
      const t = new Float32Array(tw * th);
      const buf = Buffer.alloc(tw * bytesPerPixel);
      for (let y = 0; y < th; y++) {
        const srcRow = y0 + y;
        const rowStart = dataOffset + srcRow * rowStrideBytes + x0 * bytesPerPixel;
        const { bytesRead } = await fd.read(buf, 0, tw * bytesPerPixel, rowStart);
        if (bytesRead < tw * bytesPerPixel) break;
        for (let x = 0; x < tw; x++) {
          const off = x * bytesPerPixel;
          const raw = readFloat(buf, off);
          t[y * tw + x] = raw * bscale + bzero;
        }
      }
      return t;
    }

    // Choose tiles: center + corners unless provided
    const tw = Math.min(cropSize, Math.floor(width / 2) || width);
    const th = Math.min(cropSize, Math.floor(height / 2) || height);
    const defaultTiles = [
      { x: Math.max(0, Math.floor((width - tw) / 2)), y: Math.max(0, Math.floor((height - th) / 2)), w: tw, h: th }, // center
      { x: 0, y: 0, w: tw, h: th }, // top-left
      { x: Math.max(0, width - tw), y: 0, w: tw, h: th }, // top-right
      { x: 0, y: Math.max(0, height - th), w: tw, h: th }, // bottom-left
      { x: Math.max(0, width - tw), y: Math.max(0, height - th), w: tw, h: th } // bottom-right
    ];
    const tiles = Array.isArray(options.tiles) && options.tiles.length ? options.tiles : defaultTiles;

    // Compute background using median and MAD
    function quickSelect(arr, k) {
      const a = arr.slice();
      let l = 0, r = a.length - 1;
      while (l <= r) {
        const pivot = a[Math.floor((l + r) / 2)];
        let i = l, j = r;
        while (i <= j) {
          while (a[i] < pivot) i++;
          while (a[j] > pivot) j--;
          if (i <= j) { const tmp = a[i]; a[i] = a[j]; a[j] = tmp; i++; j--; }
        }
        if (k <= j) r = j; else if (k >= i) l = i; else return a[k];
      }
      return a[k];
    }
    // Tile star extraction helpers
    function computeStats(tile, tw, th) {
      const sampleCount = Math.min(tile.length, 20000);
      const step = Math.floor(tile.length / sampleCount) || 1;
      const sample = new Float32Array(Math.floor(tile.length / step));
      for (let i = 0, j = 0; i < tile.length; i += step, j++) sample[j] = tile[i];
      const med = quickSelect(sample, Math.floor(sample.length / 2));
      const dev = new Float32Array(sample.length);
      for (let i = 0; i < sample.length; i++) dev[i] = Math.abs(sample[i] - med);
      const mad = quickSelect(dev, Math.floor(dev.length / 2));
      const sigma = mad * 1.4826;
      const thresh = med + kSigma * sigma;
      // Robust range for noise normalization
      const sorted = Array.from(sample).sort((a,b)=>a-b);
      const p05 = sorted[Math.floor(0.05 * (sorted.length - 1))] || med;
      const p95 = sorted[Math.floor(0.95 * (sorted.length - 1))] || med;
      const visited = new Uint8Array(tile.length);
  const stars = [];
      const maxRadius = 8;
      function isLocalMax(ix, iy) {
        const idx = iy * tw + ix; const val = tile[idx];
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const x = ix + dx, y = iy + dy;
            if (x < 0 || y < 0 || x >= tw || y >= th) continue;
            if (tile[y * tw + x] >= val) return false;
          }
        }
        return true;
      }
      for (let y = 1; y < th - 1; y++) {
        for (let x = 1; x < tw - 1; x++) {
          const idx = y * tw + x;
          if (visited[idx]) continue;
          if (tile[idx] < thresh) continue;
          if (!isLocalMax(x, y)) continue;
          let sumI = 0, sumX = 0, sumY = 0; let count = 0;
          let minX = x, maxX = x, minY = y, maxY = y;
          const stack = [[x, y]]; visited[idx] = 1;
          while (stack.length) {
            const [cx, cy] = stack.pop();
            const cidx = cy * tw + cx; const val = tile[cidx];
            if (val < thresh) continue;
            sumI += val; sumX += val * cx; sumY += val * cy; count++;
            if (cx < minX) minX = cx; if (cx > maxX) maxX = cx;
            if (cy < minY) minY = cy; if (cy > maxY) maxY = cy;
            for (let dy = -1; dy <= 1; dy++) {
              for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue;
                const nx = cx + dx, ny = cy + dy;
                if (nx < 0 || ny < 0 || nx >= tw || ny >= th) continue;
                const nidx = ny * tw + nx;
                if (visited[nidx]) continue;
                if (Math.abs(nx - x) > maxRadius || Math.abs(ny - y) > maxRadius) continue;
                if (tile[nidx] >= thresh) { visited[nidx] = 1; stack.push([nx, ny]); }
              }
            }
          }
          // Filter degenerate/edge-touching or tiny detections
          if (count < 12) continue;
          const touchedBorder = (minX === 0 || minY === 0 || maxX === tw - 1 || maxY === th - 1);
          if (touchedBorder) continue;
          const widthBB = maxX - minX + 1;
          const heightBB = maxY - minY + 1;
          if (widthBB < 3 || heightBB < 3) continue;
          const cx = sumX / sumI; const cy = sumY / sumI;
          let mxx = 0, myy = 0, mxy = 0, wsum = 0;
          for (let yy = Math.max(minY, 0); yy <= Math.min(maxY, th - 1); yy++) {
            for (let xx = Math.max(minX, 0); xx <= Math.min(maxX, tw - 1); xx++) {
              const v = Math.max(0, tile[yy * tw + xx] - med);
              if (v <= 0) continue;
              const dx = xx - cx; const dy = yy - cy;
              mxx += v * dx * dx; myy += v * dy * dy; mxy += v * dx * dy; wsum += v;
            }
          }
          if (wsum <= 0) continue;
          mxx /= wsum; myy /= wsum; mxy /= wsum;
          const tr = mxx + myy; const det = mxx * myy - mxy * mxy;
          const disc = Math.max(0, tr * tr - 4 * det);
          const lambda1 = (tr + Math.sqrt(disc)) / 2; const lambda2 = (tr - Math.sqrt(disc)) / 2;
          const sigmaMajor = Math.sqrt(Math.max(lambda1, 1e-6));
          const sigmaMinor = Math.sqrt(Math.max(lambda2, 1e-6));
          if (!isFinite(sigmaMajor) || !isFinite(sigmaMinor)) continue;
          if (sigmaMinor < 0.4) continue; // reject near-line detections
          let elong = Math.max(1.0, sigmaMajor / Math.max(sigmaMinor, 1e-6));
          // Cap elongation to a sane bound to avoid single-pixel artifacts
          if (!isFinite(elong) || elong > 8.0) elong = 8.0;
          const fwhmEq = 2.355 * Math.sqrt((sigmaMajor * sigmaMinor));
          stars.push({ elongation: elong, fwhm: fwhmEq });
        }
      }
      // Background noise proxy: normalize MAD sigma by robust range
      const robustRange = Math.max(1e-6, p95 - p05);
      const bgNoise = Math.max(0.005, Math.min(0.25, sigma / robustRange));
      return { stars, bgNoise };
    }

    // Read and analyze tiles
    const allStars = [];
    const tileSummaries = [];
    let bgNoises = [];
    for (const t of tiles) {
      const x0 = Math.max(0, Math.min(width - 1, t.x));
      const y0 = Math.max(0, Math.min(height - 1, t.y));
      const w = Math.max(8, Math.min(t.w, width - x0));
      const h = Math.max(8, Math.min(t.h, height - y0));
      const tile = await readTile(x0, y0, w, h);
      const { stars, bgNoise } = computeStats(tile, w, h);
      bgNoises.push(bgNoise);
      const elongList = stars.map(s => s.elongation);
      const fwhmList = stars.map(s => s.fwhm);
      const maxElong = elongList.length ? Math.max(...elongList) : 1.0;
      const p90El = elongList.length ? elongList.sort((a,b)=>a-b)[Math.floor(0.9 * (elongList.length - 1))] : 1.0;
      tileSummaries.push({ x: x0, y: y0, w, h, starCount: stars.length, maxElongation: maxElong, p90Elongation: p90El });
      allStars.push(...stars);
    }
    await fd.close();

    const starCount = allStars.length;
    if (starCount === 0) {
      const bg = bgNoises.length ? bgNoises.reduce((a,b)=>a+b,0)/bgNoises.length : 0.02;
      return { success: true, starCount: 0, fwhm: 0, starElongation: 1.0, starElongationP90: 1.0, starElongationMax: 1.0, backgroundNoise: bg, trackingError: 0, tiles: tileSummaries };
    }
    const fwhmValues = allStars.map(s => s.fwhm).sort((a,b)=>a-b);
    const elongValues = allStars.map(s => s.elongation).sort((a,b)=>a-b);
    const percentile = (arr, p) => arr[Math.min(arr.length - 1, Math.max(0, Math.floor(p * (arr.length - 1))))];
    const medianFWHM = percentile(fwhmValues, 0.5);
    const medElong = percentile(elongValues, 0.5);
    const p90Elong = percentile(elongValues, 0.9);
    const maxElong = elongValues[elongValues.length - 1];
  const trackingError = Math.max(0, (Math.min(p90Elong, 2.5) - 1.0) * 4.0);
    const bgNoise = bgNoises.length ? bgNoises.reduce((a,b)=>a+b,0)/bgNoises.length : 0.02;

    return { success: true, starCount, fwhm: medianFWHM, starElongation: p90Elong, starElongationP90: p90Elong, starElongationMax: maxElong, backgroundNoise: bgNoise, trackingError, tiles: tileSummaries };
  } catch (error) {
    console.error('analyze-fits-stars failed:', error);
    return { success: false, error: error.message };
  }
});

// Group files by actual calendar date (no session logic)
function groupFilesBySession(files) {
  const sessions = {};
  files.forEach(file => {
    // Prefer DATE-OBS; fallback to mtime calendar date
    const baseDate = file.dateObs ? file.dateObs.split('T')[0] : file.mtime.toISOString().split('T')[0];
    if (!sessions[baseDate]) sessions[baseDate] = { date: baseDate, filters: {} };
    if (!sessions[baseDate].filters[file.filter]) sessions[baseDate].filters[file.filter] = { count: 0, time: 0, files: [] };
    sessions[baseDate].filters[file.filter].count += 1;
    sessions[baseDate].filters[file.filter].time += file.exposure || 0;
    sessions[baseDate].filters[file.filter].files.push({ path: file.path, exposure: file.exposure, dateObs: file.dateObs });
  });
  return Object.values(sessions).sort((a,b) => new Date(a.date) - new Date(b.date));
}

// License management functions
function makeHttpsRequest(url, method = 'GET', data = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname + urlObj.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Constellation-App/1.0',
        ...headers
      }
    };

    if (data && method !== 'GET') {
      const dataString = JSON.stringify(data);
      options.headers['Content-Length'] = Buffer.byteLength(dataString);
    }

    const req = https.request(options, (res) => {
      let responseData = '';

      res.on('data', (chunk) => {
        responseData += chunk;
      });

      res.on('end', () => {
        try {
          const parsed = JSON.parse(responseData);
          resolve({
            statusCode: res.statusCode,
            data: parsed,
            success: res.statusCode >= 200 && res.statusCode < 300
          });
        } catch (error) {
          resolve({
            statusCode: res.statusCode,
            data: responseData,
            success: false,
            error: 'Invalid JSON response'
          });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (data && method !== 'GET') {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

// Simple helper to parse URL fragments like #access_token=...&expires_in=...
function parseHashFragment(fragment = '') {
  const out = {};
  const hash = fragment.startsWith('#') ? fragment.substring(1) : fragment;
  for (const part of hash.split('&')) {
    if (!part) continue;
    const [k, v] = part.split('=');
    out[decodeURIComponent(k)] = decodeURIComponent(v || '');
  }
  return out;
}

// Open a popup for Facebook Login and return access token from login_success.html
ipcMain.handle('instagram-login', async (event, args) => {
  try {
    const appId = args?.appId;
    const scopes = Array.isArray(args?.scopes) && args.scopes.length ? args.scopes : [
      'public_profile',
      'pages_show_list',
      'pages_read_engagement',
      'pages_manage_metadata',
      'instagram_basic',
      'instagram_manage_insights',
      'instagram_content_publish'
    ];
    if (!appId) {
      return { success: false, error: 'Missing Facebook App ID' };
    }

    const redirectUri = 'https://www.facebook.com/connect/login_success.html';
    const state = Math.random().toString(36).slice(2);
    const authUrl = `https://www.facebook.com/v19.0/dialog/oauth?client_id=${encodeURIComponent(appId)}&response_type=token&display=popup&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}&scope=${encodeURIComponent(scopes.join(','))}`;

    if (oauthWindow && !oauthWindow.isDestroyed()) {
      try { oauthWindow.close(); } catch {}
    }

    oauthWindow = new BrowserWindow({
      parent: mainWindow,
      modal: true,
      width: 520,
      height: 720,
      show: true,
      title: 'Facebook Login',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      }
    });

    return await new Promise((resolve) => {
      let resolved = false;

      const finish = (result) => {
        if (resolved) return;
        resolved = true;
        try { if (oauthWindow && !oauthWindow.isDestroyed()) oauthWindow.close(); } catch {}
        resolve(result);
      };

      oauthWindow.on('closed', () => {
        if (!resolved) finish({ success: false, error: 'Login window closed' });
      });

      const tryParseUrl = async (url) => {
        try {
          if (!url) return;
          if (url.startsWith(redirectUri)) {
            // Try to extract token from fragment. If fragment not present in URL string, query window.location.hash
            let fragment = '';
            try {
              const u = new URL(url);
              fragment = u.hash || '';
            } catch {}
            if (!fragment) {
              try {
                fragment = await oauthWindow.webContents.executeJavaScript('location.hash', true);
              } catch {}
            }
            const params = parseHashFragment(fragment);
            if (params.access_token) {
              const expiresIn = Number(params.expires_in || '0');
              finish({ success: true, accessToken: params.access_token, expiresIn, scope: params.scope || '', state: params.state || state });
            } else if (params.error || params.error_description) {
              finish({ success: false, error: params.error_description || params.error || 'Login failed' });
            }
          }
        } catch (e) {
          // ignore
        }
      };

      oauthWindow.webContents.on('did-navigate', (_e, url) => tryParseUrl(url));
      oauthWindow.webContents.on('will-redirect', (_e, url) => tryParseUrl(url));
      oauthWindow.webContents.on('did-redirect-navigation', (_e, url) => tryParseUrl(url));

      oauthWindow.loadURL(authUrl);
    });
  } catch (error) {
    console.error('instagram-login failed:', error);
    return { success: false, error: error.message };
  }
});

// Discover IG business accounts accessible to the user (via their Pages)
ipcMain.handle('instagram-discover-accounts', async (_event, { accessToken }) => {
  try {
    if (!accessToken) return { success: false, error: 'Missing access token' };
    // Get pages the user manages, include instagram_business_account and page access token
    const url = `https://graph.facebook.com/v19.0/me/accounts?fields=id,name,access_token,instagram_business_account`;
    const resp = await makeHttpsRequest(url, 'GET', null, { Authorization: `Bearer ${accessToken}` });
    if (!resp.success) return { success: false, error: resp.data?.error?.message || 'Failed to list pages' };
    const pages = Array.isArray(resp.data?.data) ? resp.data.data : [];
    const accounts = [];
    for (const p of pages) {
      const ig = p.instagram_business_account;
      if (ig && ig.id) {
        accounts.push({ pageId: p.id, pageName: p.name, pageAccessToken: p.access_token, igUserId: ig.id });
      }
    }
    if (!accounts.length) return { success: false, error: 'No Instagram business accounts found. Ensure your IG account is professional and connected to a Facebook Page.' };
    return { success: true, accounts };
  } catch (error) {
    console.error('instagram-discover-accounts failed:', error);
    return { success: false, error: error.message };
  }
});

// Fetch IG user info like username
ipcMain.handle('instagram-get-ig-user', async (_event, { igUserId, accessToken }) => {
  try {
    if (!igUserId || !accessToken) return { success: false, error: 'Missing igUserId or access token' };
    const url = `https://graph.facebook.com/v19.0/${encodeURIComponent(igUserId)}?fields=id,username,profile_picture_url`;
    const resp = await makeHttpsRequest(url, 'GET', null, { Authorization: `Bearer ${accessToken}` });
    if (!resp.success) return { success: false, error: resp.data?.error?.message || 'Failed to fetch IG user' };
    return { success: true, user: resp.data };
  } catch (error) {
    console.error('instagram-get-ig-user failed:', error);
    return { success: false, error: error.message };
  }
});

// Publish a single image: create container then publish
ipcMain.handle('instagram-publish-image', async (_event, { igUserId, accessToken, imageUrl, caption }) => {
  try {
    if (!igUserId || !accessToken || !imageUrl) return { success: false, error: 'Missing required parameters' };
    // Create media container
    const createUrl = `https://graph.facebook.com/v19.0/${encodeURIComponent(igUserId)}/media`;
    const cResp = await makeHttpsRequest(createUrl, 'POST', { image_url: imageUrl, caption: caption || '' }, { Authorization: `Bearer ${accessToken}` });
    if (!cResp.success || !cResp.data?.id) {
      return { success: false, error: cResp.data?.error?.message || 'Failed to create media container' };
    }
    const containerId = cResp.data.id;

    // Optional: poll status for up to ~5 mins (we'll do a short quick poll here)
    const statusUrl = `https://graph.facebook.com/v19.0/${encodeURIComponent(containerId)}?fields=status_code`;
    let status = 'IN_PROGRESS';
    const start = Date.now();
    while (Date.now() - start < 60_000) { // up to 60s
      const sResp = await makeHttpsRequest(statusUrl, 'GET', null, { Authorization: `Bearer ${accessToken}` });
      if (sResp.success && sResp.data?.status_code) {
        status = sResp.data.status_code;
        if (status === 'FINISHED' || status === 'PUBLISHED') break;
        if (status === 'ERROR' || status === 'EXPIRED') break;
      }
      await new Promise(r => setTimeout(r, 2000));
    }
    if (status === 'ERROR' || status === 'EXPIRED') {
      return { success: false, error: `Container status ${status}` };
    }

    // Publish container
    const publishUrl = `https://graph.facebook.com/v19.0/${encodeURIComponent(igUserId)}/media_publish`;
    const pResp = await makeHttpsRequest(publishUrl, 'POST', { creation_id: containerId }, { Authorization: `Bearer ${accessToken}` });
    if (!pResp.success || !pResp.data?.id) {
      return { success: false, error: pResp.data?.error?.message || 'Failed to publish media' };
    }
    return { success: true, mediaId: pResp.data.id };
  } catch (error) {
    console.error('instagram-publish-image failed:', error);
    return { success: false, error: error.message };
  }
});

function generateStableDeviceId() {
  try {
    // Create a stable device ID based on system characteristics
    const networkInterfaces = os.networkInterfaces();
    const cpus = os.cpus();
    const platform = os.platform();
    const arch = os.arch();
    const hostname = os.hostname();
    
    // Collect MAC addresses
    const macAddresses = [];
    for (const interfaceName in networkInterfaces) {
      const interfaces = networkInterfaces[interfaceName];
      for (const iface of interfaces) {
        if (iface.mac && iface.mac !== '00:00:00:00:00:00') {
          macAddresses.push(iface.mac);
        }
      }
    }
    
    // Create fingerprint
    const fingerprint = {
      platform,
      arch,
      hostname,
      cpuModel: cpus[0]?.model || 'unknown',
      cpuCount: cpus.length,
      macAddresses: macAddresses.sort() // Sort for consistency
    };
    
    // Generate hash
    const hash = crypto.createHash('sha256');
    hash.update(JSON.stringify(fingerprint));
    return 'device-' + hash.digest('hex').substring(0, 32);
  } catch (error) {
    console.error('Error generating device ID:', error);
    // Fallback to random ID that persists in settings
    return 'fallback-' + crypto.randomBytes(16).toString('hex');
  }
}

// License validation IPC handlers
ipcMain.handle('validate-license', async (event, apiUrl, requestBody) => {
  try {
    const result = await makeHttpsRequest(apiUrl, 'POST', requestBody);
    
    if (result.success && result.data.valid) {
      return {
        success: true,
        data: result.data
      };
    } else {
      return {
        success: false,
        error: result.data.reason || 'License validation failed'
      };
    }
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
});

ipcMain.handle('verify-jwt-token', async (event, token, licenseKey) => {
  try {
    // Simplified JWT verification - in production would use proper JWT library
    // For now, just check if token exists and is not expired
    if (!token) return false;
    
    // Basic token format check
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    
    try {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
      const now = Math.floor(Date.now() / 1000);
      
      // Check expiration
      if (payload.exp && payload.exp < now) return false;
      
      // Check license key matches
      if (payload.sub && payload.sub.toUpperCase() !== licenseKey.toUpperCase()) return false;
      
      return true;
    } catch (decodeError) {
      return false;
    }
  } catch (error) {
    console.error('JWT verification error:', error);
    return false;
  }
});

ipcMain.handle('get-device-id', async () => {
  try {
    const settings = store.get('settings', {});
    return settings.deviceId || null;
  } catch (error) {
    return null;
  }
});

ipcMain.handle('generate-device-id', async () => {
  try {
    const deviceId = generateStableDeviceId();
    
    // Store in settings
    const settings = store.get('settings', {});
    settings.deviceId = deviceId;
    store.set('settings', settings);
    
    return deviceId;
  } catch (error) {
    console.error('Error generating device ID:', error);
    return 'error-' + Date.now();
  }
});
