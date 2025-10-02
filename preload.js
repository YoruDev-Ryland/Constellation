const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  scanDirectory: (dirPath) => ipcRenderer.invoke('scan-directory', dirPath),
  readFitsHeader: (filePath) => ipcRenderer.invoke('read-fits-header', filePath),
  renameFolder: (oldPath, newName) => ipcRenderer.invoke('rename-folder', oldPath, newName),
  deleteFolder: (folderPath) => ipcRenderer.invoke('delete-folder', folderPath),
  getProjects: () => ipcRenderer.invoke('get-projects'),
  saveProjects: (projects) => ipcRenderer.invoke('save-projects', projects),
  completeSetup: () => ipcRenderer.invoke('complete-setup'),
  openSettings: () => ipcRenderer.invoke('open-settings'),
  windowControl: (action) => ipcRenderer.invoke('window-control', action),
  loadLibraryDatabase: () => ipcRenderer.invoke('load-library-database'),
  saveLibraryDatabase: (data) => ipcRenderer.invoke('save-library-database', data),
  findProjectThumbnail: (projectName, storagePath) => ipcRenderer.invoke('find-project-thumbnail', projectName, storagePath),
  selectCustomThumbnail: () => ipcRenderer.invoke('select-custom-thumbnail'),
  copyThumbnailToProject: (sourcePath, projectName, storagePath) => ipcRenderer.invoke('copy-thumbnail-to-project', sourcePath, projectName, storagePath),
  scanProjectFiles: (projectName, storagePath) => ipcRenderer.invoke('scan-project-files', projectName, storagePath),
  getCalendarImages: (storagePath, forceRefresh) => ipcRenderer.invoke('get-calendar-images', storagePath, forceRefresh)
});