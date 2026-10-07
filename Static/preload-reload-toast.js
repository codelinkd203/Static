const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('reloadToastAPI', {
  getSettings: () => ipcRenderer.invoke('get-reload-settings'),
  setSetting: (key, value) => ipcRenderer.send('set-reload-setting', { key, value }),
  reloadNow: () => ipcRenderer.send('reload-toast-reload-now'),
  hideNative: () => ipcRenderer.send('reload-toast-hide-native'),
  onShow: (callback) => ipcRenderer.on('reload-toast-show', () => callback()),
});
