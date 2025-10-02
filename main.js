const { app, BrowserWindow, ipcMain, dialog, screen } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const Store = require('electron-store');

const store = new Store();
let mainWindow;


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

  // Uncomment the line below if you need developer tools for debugging
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
    const buffer = await fs.readFile(filePath);
    return parseFitsHeader(buffer);
  } catch (error) {
    console.error('Error reading FITS:', error);
    return null;
  }
});

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
  mainWindow.loadFile('renderer/setup.html');
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
    console.log('Finding thumbnail for project:', projectName, 'in:', storagePath);
    
    // Look for project folder in storage path
    const projectFolders = await findProjectFolders(storagePath, projectName);
    console.log('Found project folders:', projectFolders);
    
    for (const projectFolder of projectFolders) {
      console.log('Searching for JPGs in:', projectFolder);
      const thumbnail = await findNewestJpgInDirectory(projectFolder);
      console.log('Found thumbnail:', thumbnail);
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

// Scan project folder for actual file data
ipcMain.handle('scan-project-files', async (event, projectName, storagePath) => {
  try {
    console.log('[scan-project-files] Starting scan for project:', projectName);
    const projectFolders = await findProjectFolders(storagePath, projectName);
    if (projectFolders.length === 0) {
      return { success: true, sessions: [], debug: { reason: 'no-project-folders', projectName } };
    }

    const fileData = [];
    for (const projectFolder of projectFolders) {
      console.log('[scan-project-files] Scanning folder:', projectFolder);
      const files = await scanProjectFolder(projectFolder);
      fileData.push(...files);
    }

    const sessions = groupFilesBySession(fileData);
    if (sessions.length === 0) {
      return { success: true, sessions: [], debug: { reason: 'no-sessions-derived', examined: fileData.length, sample: fileData.slice(0,5).map(f=>({filename:f.filename, dateObs:f.dateObs, filter:f.filter, exposure:f.exposure})), missingDateObs: fileData.filter(f=>!f.dateObs).length } };
    }
    return { success: true, sessions };
  } catch (error) {
    console.error('Error scanning project files:', error);
    return { success: false, error: error.message };
  }
});

// Calendar images: return a mapping of date -> latest JPG path among all project folders
ipcMain.handle('get-calendar-images', async (event, storagePath) => {
  try {
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
    const result = Object.fromEntries(Object.entries(dateToImage).map(([date, obj]) => [date, obj.path]));
    return { success: true, images: result };
  } catch (error) {
    console.error('Error getting calendar images:', error);
    return { success: false, error: error.message };
  }
});

// Helper functions
async function findProjectFolders(storagePath, projectName) {
  const folders = [];
  
  async function searchDirectory(dirPath, depth = 0) {
    if (depth > 3) return; // Limit search depth
    
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const fullPath = path.join(dirPath, entry.name);
          
          // Check if directory name matches project name (exact match, case insensitive)
          const folderName = entry.name.toLowerCase().trim();
          const searchName = projectName.toLowerCase().trim();
          
          if (folderName === searchName) {
            folders.push(fullPath);
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
