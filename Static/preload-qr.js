const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('qrAPI', {
  close: () => ipcRenderer.send('qr-close'),
});
