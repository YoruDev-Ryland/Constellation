const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  scanDirectory: (dirPath) => ipcRenderer.invoke('scan-directory', dirPath),
  readFitsHeader: (filePath) => ipcRenderer.invoke('read-fits-header', filePath),
  renameFolder: (oldPath, newName) => ipcRenderer.invoke('rename-folder', oldPath, newName),
  moveFolder: (sourcePath, destinationPath) => ipcRenderer.invoke('move-folder', sourcePath, destinationPath),
  deleteFolder: (folderPath) => ipcRenderer.invoke('delete-folder', folderPath),
  checkPathExists: (filePath) => ipcRenderer.invoke('check-path-exists', filePath),
  getProjects: () => ipcRenderer.invoke('get-projects'),
  saveProjects: (projects) => ipcRenderer.invoke('save-projects', projects),
  completeSetup: () => ipcRenderer.invoke('complete-setup'),
  openSettings: () => ipcRenderer.invoke('open-settings'),
  windowControl: (action) => ipcRenderer.invoke('window-control', action),
  loadLibraryDatabase: () => ipcRenderer.invoke('load-library-database'),
  saveLibraryDatabase: (data) => ipcRenderer.invoke('save-library-database', data),
  loadArchiveLibraryDatabase: (archivePath) => ipcRenderer.invoke('load-archive-library-database', archivePath),
  saveArchiveLibraryDatabase: (archivePath, data) => ipcRenderer.invoke('save-archive-library-database', archivePath, data),
  findProjectThumbnail: (projectName, storagePath) => ipcRenderer.invoke('find-project-thumbnail', projectName, storagePath),
  fetchProjectThumbnail: (projectName, storagePath) => ipcRenderer.invoke('fetch-project-thumbnail', projectName, storagePath),
  selectCustomThumbnail: () => ipcRenderer.invoke('select-custom-thumbnail'),
  copyThumbnailToProject: (sourcePath, projectName, storagePath) => ipcRenderer.invoke('copy-thumbnail-to-project', sourcePath, projectName, storagePath),
  scanProjectFiles: (projectName, storagePath) => ipcRenderer.invoke('scan-project-files', projectName, storagePath),
  getCalendarImages: (storagePath, forceRefresh) => ipcRenderer.invoke('get-calendar-images', storagePath, forceRefresh),
  // License management
  validateLicense: (apiUrl, requestBody) => ipcRenderer.invoke('validate-license', apiUrl, requestBody),
  verifyJwtToken: (token, licenseKey) => ipcRenderer.invoke('verify-jwt-token', token, licenseKey),
  getDeviceId: () => ipcRenderer.invoke('get-device-id'),
  generateDeviceId: () => ipcRenderer.invoke('generate-device-id'),
  
  // Listen for settings modal events
  onShowSettings: (callback) => ipcRenderer.on('show-settings-modal', callback),
  onMoveProgress: (callback) => ipcRenderer.on('move-progress', (event, data) => callback(data)),
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),
  // List JPG/JPEG images within a project folder (recursively)
  listProjectImages: (projectPath) => ipcRenderer.invoke('list-project-images', projectPath),
  listProjectImagesForProject: (projectName, storagePath) => ipcRenderer.invoke('list-project-images-for-project', projectName, storagePath),
  
  // Sub-Frame Analyzer APIs
  selectFile: (options) => ipcRenderer.invoke('select-file', options),
  selectFolder: (options) => ipcRenderer.invoke('select-folder', options),
  scanFitsFolder: (folderPath) => ipcRenderer.invoke('scan-fits-folder', folderPath),
  analyzeFitsStars: (filePath, options) => ipcRenderer.invoke('analyze-fits-stars', filePath, options),
  createDirectory: (dirPath) => ipcRenderer.invoke('create-directory', dirPath),
  copyFile: (sourcePath, destPath) => ipcRenderer.invoke('copy-file', sourcePath, destPath),
  launchProgram: (programPath, args = []) => ipcRenderer.invoke('launch-program', programPath, Array.isArray(args) ? args : []),
  // Starloch auth
  authLogin: (identifier, password) => ipcRenderer.invoke('auth-login', { identifier, password }),
  authMe: () => ipcRenderer.invoke('auth-me'),
  authLogout: () => ipcRenderer.invoke('auth-logout'),
  getAuthToken: () => ipcRenderer.invoke('get-auth-token')
  ,
  // Instagram/Meta Graph integrations
  instagramLogin: (args) => ipcRenderer.invoke('instagram-login', args),
  instagramDiscoverAccounts: (args) => ipcRenderer.invoke('instagram-discover-accounts', args),
  instagramGetIgUser: (args) => ipcRenderer.invoke('instagram-get-ig-user', args),
  instagramPublishImage: (args) => ipcRenderer.invoke('instagram-publish-image', args),
  
  // Auto-updater
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  onUpdaterMessage: (callback) => ipcRenderer.on('updater-message', (event, message) => callback(message)),
  
  // Image export
  saveImageBuffer: (data) => ipcRenderer.invoke('save-image', data)
});