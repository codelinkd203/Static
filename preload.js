const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('staticAPI', {
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  startPreview: (folderPath, startUrl) => ipcRenderer.invoke('start-preview', folderPath, startUrl),
  // Electron 30+ requires webUtils.getPathForFile to resolve a dropped
  // File object to a real filesystem path (File.path was removed).
  getPathForFile: (file) => webUtils.getPathForFile(file),
});
