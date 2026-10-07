const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('settingsAPI', {
  getSettings: () => ipcRenderer.invoke('get-app-settings'),
  setSetting: (key, value) => ipcRenderer.send('set-app-setting', { key, value }),
  clearHistory: () => ipcRenderer.send('clear-folder-history'),
  openHistoryFolder: (folderPath) => ipcRenderer.send('open-history-folder', folderPath),
});
