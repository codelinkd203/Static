const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('previewAPI', {
  getBrowsers: () => ipcRenderer.invoke('get-browsers'),
  getServingInfo: () => ipcRenderer.invoke('get-serving-info'),
  openInBrowser: (appName, url) => ipcRenderer.send('open-in-browser', { appName, url }),
  openNativeDevtools: () => ipcRenderer.send('open-native-devtools'),
  reloadPreview: () => ipcRenderer.send('reload-preview'),
  navBack: () => ipcRenderer.send('nav-back'),
  navForward: () => ipcRenderer.send('nav-forward'),
  navigateTo: (url) => ipcRenderer.send('navigate-preview', { url }),
  selectTab: (tabId) => ipcRenderer.send('select-preview-tab', { tabId }),
  closeTab: (tabId) => ipcRenderer.send('close-preview-tab', { tabId }),
  stopAndClose: () => ipcRenderer.send('stop-and-close'),
  minimizeWindow: () => ipcRenderer.send('minimize-window'),
  onLoadState: (callback) =>
    ipcRenderer.on('preview-load-state', (_event, state) => callback(state)),
  onNavState: (callback) =>
    ipcRenderer.on('preview-nav-state', (_event, state) => callback(state)),
  onUrlChanged: (callback) =>
    ipcRenderer.on('preview-url-changed', (_event, state) => callback(state)),
  onTabsChanged: (callback) =>
    ipcRenderer.on('preview-tabs-changed', (_event, state) => callback(state)),
});