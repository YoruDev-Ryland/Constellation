/**
 * Auto-updater module for Constellation
 * Handles checking for updates and installing them in the background
 */

const { autoUpdater } = require('electron-updater');
const { app, BrowserWindow, ipcMain } = require('electron');
const log = require('electron-log');

// Configure logging
autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';
log.info('Auto-updater initialized');

// Configuration
autoUpdater.autoDownload = false; // Don't auto-download, let user control
autoUpdater.autoInstallOnAppQuit = true; // Install when app quits

let updateDownloaded = false;
let mainWindow = null;

/**
 * Initialize auto-updater with the main window
 * @param {BrowserWindow} window - The main application window
 */
function initAutoUpdater(window) {
  mainWindow = window;

  // Check for updates when app is ready (after a short delay)
  setTimeout(() => {
    checkForUpdates();
  }, 5000); // Wait 5 seconds after app start

  // Set up event listeners
  setupEventListeners();
  setupIpcHandlers();
}

/**
 * Set up auto-updater event listeners
 */
function setupEventListeners() {
  // When checking for updates
  autoUpdater.on('checking-for-update', () => {
    log.info('Checking for updates...');
    sendStatusToWindow('checking-for-update');
  });

  // When update is available
  autoUpdater.on('update-available', (info) => {
    log.info('Update available:', info.version);
    sendStatusToWindow('update-available', {
      version: info.version,
      releaseDate: info.releaseDate,
      releaseNotes: info.releaseNotes
    });
  });

  // When no update is available
  autoUpdater.on('update-not-available', (info) => {
    log.info('Update not available. Current version is latest.');
    sendStatusToWindow('update-not-available', { version: info.version });
  });

  // When update download progress
  autoUpdater.on('download-progress', (progressObj) => {
    const message = `Downloaded ${progressObj.percent.toFixed(2)}% (${formatBytes(progressObj.transferred)}/${formatBytes(progressObj.total)})`;
    log.info(message);
    sendStatusToWindow('download-progress', {
      percent: progressObj.percent,
      transferred: progressObj.transferred,
      total: progressObj.total,
      bytesPerSecond: progressObj.bytesPerSecond
    });
  });

  // When update is downloaded
  autoUpdater.on('update-downloaded', (info) => {
    log.info('Update downloaded:', info.version);
    updateDownloaded = true;
    sendStatusToWindow('update-downloaded', {
      version: info.version,
      releaseDate: info.releaseDate
    });
  });

  // On error
  autoUpdater.on('error', (err) => {
    log.error('Error in auto-updater:', err);
    sendStatusToWindow('error', {
      message: err.message || 'Unknown error occurred'
    });
  });
}

/**
 * Set up IPC handlers for renderer process communication
 */
function setupIpcHandlers() {
  // Check for updates manually
  ipcMain.handle('check-for-updates', async () => {
    return await checkForUpdates();
  });

  // Download update
  ipcMain.handle('download-update', async () => {
    try {
      await autoUpdater.downloadUpdate();
      return { success: true };
    } catch (error) {
      log.error('Failed to download update:', error);
      return { success: false, error: error.message };
    }
  });

  // Install update and restart
  ipcMain.handle('install-update', () => {
    if (updateDownloaded) {
      setImmediate(() => {
        app.removeAllListeners('window-all-closed');
        autoUpdater.quitAndInstall(false, true);
      });
      return { success: true };
    }
    return { success: false, error: 'No update downloaded' };
  });

  // Get current version
  ipcMain.handle('get-app-version', () => {
    return app.getVersion();
  });
}

/**
 * Check for updates
 */
async function checkForUpdates() {
  // Don't check in development
  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    log.info('Skipping update check in development mode');
    return { available: false, reason: 'development' };
  }

  try {
    const result = await autoUpdater.checkForUpdates();
    return {
      available: result.updateInfo.version !== app.getVersion(),
      currentVersion: app.getVersion(),
      latestVersion: result.updateInfo.version
    };
  } catch (error) {
    log.error('Error checking for updates:', error);
    return { available: false, error: error.message };
  }
}

/**
 * Send status to renderer window
 */
function sendStatusToWindow(event, data = {}) {
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('updater-message', { event, data });
  }
}

/**
 * Format bytes to human readable
 */
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

module.exports = {
  initAutoUpdater,
  checkForUpdates
};
