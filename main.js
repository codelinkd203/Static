const {
  app,
  BrowserWindow,
  WebContentsView,
  ipcMain,
  dialog,
  nativeImage,
  session,
  Menu,
  shell,
  clipboard,
} = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const { spawn, execFileSync } = require('child_process');

const TOOLBAR_HEIGHT = 44;
const TAB_BAR_HEIGHT = 32;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let launcherWin = null;
let previewWindows = [];
let serverProcess = null;
let servingPort = 9090;
let servingFolder = null;

// ---------------------------------------------------------------------------
// Browser detection (macOS) — real installed apps only, real icons
// ---------------------------------------------------------------------------
const BROWSER_CANDIDATES = [
  { id: 'safari', label: 'Safari', appName: 'Safari', bundlePath: '/Applications/Safari.app' },
  { id: 'chrome', label: 'Chrome', appName: 'Google Chrome', bundlePath: '/Applications/Google Chrome.app' },
  { id: 'firefox', label: 'Firefox', appName: 'Firefox', bundlePath: '/Applications/Firefox.app' },
  { id: 'arc', label: 'Arc', appName: 'Arc', bundlePath: '/Applications/Arc.app' },
  { id: 'brave', label: 'Brave', appName: 'Brave Browser', bundlePath: '/Applications/Brave Browser.app' },
  { id: 'edge', label: 'Edge', appName: 'Microsoft Edge', bundlePath: '/Applications/Microsoft Edge.app' },
];

// Reads Contents/Info.plist inside a .app bundle and pulls out CFBundleIconFile.
// This is a fallback path for icon extraction — app.getFileIcon() is usually
// fine, but on some setups it silently returns an empty image, so we back it
// up with a direct read of the bundle's actual .icns resource.
function readIconFileFromBundle(bundlePath) {
  try {
    const plistPath = path.join(bundlePath, 'Contents', 'Info.plist');
    const plistText = fs.readFileSync(plistPath, 'utf8');
    const match = plistText.match(/<key>CFBundleIconFile<\/key>\s*<string>([^<]+)<\/string>/);
    if (!match) return null;
    let iconFile = match[1];
    if (!iconFile.toLowerCase().endsWith('.icns')) iconFile += '.icns';
    const iconPath = path.join(bundlePath, 'Contents', 'Resources', iconFile);
    return fs.existsSync(iconPath) ? iconPath : null;
  } catch (err) {
    return null;
  }
}

// Converts a .icns file to a PNG via macOS's built-in `sips` tool, then
// loads that PNG as a NativeImage. This sidesteps the fact that Electron's
// own nativeImage ICNS decoding is inconsistent across versions/setups —
// `sips` ships on every Mac and reliably handles icon conversion.
function convertIcnsToDataURL(icnsPath) {
  const tmpPng = path.join(
    os.tmpdir(),
  `static-icon-${Date.now()}-${Math.random().toString(36).slice(2)}.png`
  );
  try {
    // Keep this call minimal — just format conversion, no inline resize
    // flags — then resize afterwards with nativeImage's own (reliable)
    // resize, so there's only one thing that can go wrong at a time.
    execFileSync('sips', ['-s', 'format', 'png', icnsPath, '--out', tmpPng], {
      stdio: 'ignore',
    });

    if (!fs.existsSync(tmpPng) || fs.statSync(tmpPng).size === 0) return null;

    const img = nativeImage.createFromPath(tmpPng);
    const size = img.getSize();
    if (img.isEmpty() || size.width === 0 || size.height === 0) return null;

    const target = size.width > 64 || size.height > 64
    ? img.resize({ width: 64, height: 64, quality: 'best' })
    : img;

    const dataUrl = target.toDataURL();
    // A valid PNG data URL is always well over this length; anything
    // shorter means we got a corrupt/empty image and should not use it.
    if (!dataUrl || dataUrl.length < 100) return null;
    return dataUrl;
  } catch (err) {
    return null;
  } finally {
    fs.unlink(tmpPng, () => {}); // best-effort cleanup, ignore errors
  }
}

async function getAppIconDataURL(bundlePath) {
  // Attempt 1: Electron's built-in file-icon lookup — fast when it works.
  try {
    const img = await app.getFileIcon(bundlePath, { size: 'large' });
    const size = img ? img.getSize() : { width: 0, height: 0 };
    if (img && !img.isEmpty() && size.width > 0 && size.height > 0) {
      const dataUrl = img.toDataURL();
      if (dataUrl && dataUrl.length > 100) return dataUrl;
    }
  } catch (err) {
    /* fall through to attempt 2 */
  }

  // Attempt 2: locate the bundle's real .icns via Info.plist, then convert
  // it with `sips` — this is the reliable path and should always succeed
  // for any normal, installed .app.
  try {
    const iconPath = readIconFileFromBundle(bundlePath);
    if (iconPath) {
      const dataUrl = convertIcnsToDataURL(iconPath);
      if (dataUrl) return dataUrl;
    }
  } catch (err) {
    /* give up, caller falls back to a letter avatar */
  }

  return null;
}

async function detectInstalledBrowsers() {
  const found = [];
  for (const candidate of BROWSER_CANDIDATES) {
    if (fs.existsSync(candidate.bundlePath)) {
      const icon = await getAppIconDataURL(candidate.bundlePath);
      found.push({ ...candidate, icon });
    }
  }
  return found;
}

function openUrlInBrowser(appName, url) {
  // `open -a "App Name" url` is the correct, sandbox-safe way to target
  // a specific installed browser on macOS.
  spawn('open', ['-a', appName, url], { detached: true, stdio: 'ignore' }).unref();
}

// ---------------------------------------------------------------------------
// Local server lifecycle
// ---------------------------------------------------------------------------
function killServer() {
  if (serverProcess && !serverProcess.killed) {
    try {
      serverProcess.kill('SIGTERM');
    } catch (err) {
      /* already dead */
    }
  }
  serverProcess = null;
}

function startHttpServer(folderPath, port) {
  return new Promise((resolve, reject) => {
    const candidates = ['python3', 'python'];
    let idx = 0;

    const tryNext = () => {
      if (idx >= candidates.length) {
        reject(new Error('No python3/python binary found on PATH.'));
        return;
      }
      const bin = candidates[idx++];
      const proc = spawn(bin, ['-m', 'http.server', String(port)], {
        cwd: folderPath,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let settled = false;

      proc.on('error', () => {
        if (!settled) tryNext();
      });

      proc.stderr.on('data', (chunk) => {
        const text = chunk.toString();
        // Python's http.server logs startup + requests to stderr; that's
        // normal, so only treat an actual traceback as a real failure.
        if (/Traceback/.test(text) && !settled) {
          settled = true;
          reject(new Error(text));
        }
      });

      setTimeout(() => {
        if (!settled) {
          settled = true;
          serverProcess = proc;
          resolve(proc);
        }
      }, 150);
    };

    tryNext();
  });
}

function waitForServerReady(url, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const attempt = () => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve(true);
      });
      req.on('error', () => {
        if (Date.now() - start > timeoutMs) {
          reject(new Error('Server did not become ready in time.'));
        } else {
          setTimeout(attempt, 150);
        }
      });
      req.setTimeout(1000, () => req.destroy());
    };
    attempt();
  });
}

// ---------------------------------------------------------------------------
// Windows
// ---------------------------------------------------------------------------
function createLauncherWindow() {
  launcherWin = new BrowserWindow({
    width: 620,
    height: 500,
    resizable: false,
    fullscreenable: false,
    maximizable: false,
    minimizable: true,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: true,
    vibrancy: 'fullscreen-ui',
    visualEffectState: 'active',
    titleBarStyle: 'hiddenInset',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  launcherWin.loadFile(path.join(__dirname, 'renderer', 'launcher.html'));

  launcherWin.once('ready-to-show', () => {
    launcherWin.show();
  });

  launcherWin.on('closed', () => {
    launcherWin = null;
    if (previewWindows.length === 0) {
      killServer();
      app.quit();
    }
  });
}

// Keeps the WebContentsView's bounds glued to the window's content area,
// directly beneath the toolbar and tab strip. Called on create + every resize.
function getPreviewState(win) {
  return previewWindows.find((entry) => entry.win === win) || null;
}

function getActiveTab(state) {
  return state?.tabs.find((tab) => tab.id === state.activeTabId) || state?.tabs[0] || null;
}

// Finds which tab owns a given webContents id. Used by the network-level
// error tracking below, since HTTP status codes and connection failures
// come from session.webRequest (keyed by webContentsId), not from the
// tab's own WebContentsView instance.
function findOwnerTab(webContentsId) {
  for (const state of previewWindows) {
    const tab = state.tabs.find((entry) => entry.view?.webContents.id === webContentsId);
    if (tab) return { win: state.win, tab };
  }
  return null;
}

function bumpTabErrorCount(win, tab, message) {
  tab.consoleErrors = (tab.consoleErrors || 0) + 1;

  console.log(
    `[Static] Console error in ${tab.id}: #${tab.consoleErrors}`,
    message
  );

  if (win.isDestroyed()) return;

  win.webContents.send('preview-console-error', {
    tabId: tab.id,
    count: tab.consoleErrors,
  });

  sendTabsChanged(win);
}

// session.webRequest only supports a single onCompleted/onErrorOccurred
// listener per session (registering again replaces the previous one), so
// this is installed once and dispatches to whichever tab owns the request,
// rather than being wired up per-tab like the other listeners below.
let networkErrorTrackingInstalled = false;
function installNetworkErrorTracking() {
  if (networkErrorTrackingInstalled) return;
  networkErrorTrackingInstalled = true;

  const wr = session.defaultSession.webRequest;

  // HTTP-level failures (404, 500, ...). did-fail-load never sees these
  // because the network request itself "succeeds" with an error status —
  // this is the category the devtools badge was missing entirely.
  wr.onCompleted((details) => {
    if (details.statusCode < 400) return;
    const owner = findOwnerTab(details.webContentsId);
    if (!owner) return;
    bumpTabErrorCount(
      owner.win,
      owner.tab,
      `${details.statusCode} ${details.method} ${details.url}`
    );
  });

  // Network-level failures: DNS errors, connection refused, blocked mixed
  // content, etc. ERR_ABORTED fires constantly during normal navigation
  // and redirects, so it's excluded to avoid false positives.
  wr.onErrorOccurred((details) => {
    if (details.error === 'net::ERR_ABORTED') return;
    const owner = findOwnerTab(details.webContentsId);
    if (!owner) return;
    bumpTabErrorCount(
      owner.win,
      owner.tab,
      `${details.error} ${details.method} ${details.url}`
    );
  });
}

function getSerializableTabs(state) {
  return (state?.tabs || []).map((tab) => ({
    id: tab.id,
    title: tab.title,
    url: tab.url,
    origin: tab.origin,
    consoleErrors: tab.consoleErrors || 0,
  }));
}

function updatePreviewViewBounds(win) {
  const state = getPreviewState(win);
  if (!state) return;

  const { width, height } = win.getContentBounds();
  const activeTab = getActiveTab(state);
  if (!activeTab?.view) return;

  const tabBarHeight = state.tabs.length > 1 ? TAB_BAR_HEIGHT : 0;

  state.tabs.forEach((tab) => {
    if (tab.view) tab.view.setVisible(tab.id === activeTab.id);
  });

  activeTab.view.setBounds({
    x: 0,
    y: TOOLBAR_HEIGHT + tabBarHeight,
    width,
    height: Math.max(0, height - TOOLBAR_HEIGHT - tabBarHeight),
  });
}

function sendLoadState(win, loading) {
  if (win && !win.isDestroyed()) {
    win.webContents.send('preview-load-state', { loading });
  }
}

function sendNavState(win) {
  const state = getPreviewState(win);
  const activeTab = getActiveTab(state);
  const wc = activeTab?.view?.webContents;
  if (win && !win.isDestroyed() && wc) {
    win.webContents.send('preview-nav-state', {
      canGoBack: wc.canGoBack(),
      canGoForward: wc.canGoForward(),
    });
  }
}

function sendUrlChanged(win, url) {
  if (win && !win.isDestroyed()) {
    win.webContents.send('preview-url-changed', { url });
  }
}

function sendTabsChanged(win) {
  const state = getPreviewState(win);
  if (win && !win.isDestroyed()) {
    win.webContents.send('preview-tabs-changed', {
      tabs: getSerializableTabs(state),
      activeTabId: state?.activeTabId || null,
    });
  }
}

function activateTab(win, tabId) {
  const state = getPreviewState(win);
  if (!state) return null;

  const tab = state.tabs.find((entry) => entry.id === tabId);
  if (!tab) return null;

  state.activeTabId = tab.id;
  state.tabs.forEach((entry) => {
    if (entry.view) entry.view.setVisible(entry.id === tab.id);
  });
  updatePreviewViewBounds(win);
  sendNavState(win);
  sendUrlChanged(win, tab.url || '');
  sendTabsChanged(win);
  return tab;
}

function loadTabUrl(win, tab, targetUrl) {

  tab.consoleErrors = 0;

  win.webContents.send('preview-console-error', {
    tabId: tab.id,
    count: 0,
  });

  if (!tab?.view) return;
  const resolvedUrl = targetUrl.toString();
  tab.url = resolvedUrl;
  tab.origin = new URL(resolvedUrl).origin;
  tab.view.webContents.loadURL(resolvedUrl);
  sendNavState(win);
  sendUrlChanged(win, resolvedUrl);
  sendTabsChanged(win);
}

function addPreviewTab(win, { url, title = 'Preview', startPath = '/', loadImmediately = true } = {}) {
  const state = getPreviewState(win);
  if (!state) return null;

  installNetworkErrorTracking();

  const tabId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const previewView = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      disableHttpCache: true,
    },
  });
  win.contentView.addChildView(previewView);
  previewView.setVisible(false);

  const tab = {
    id: tabId,
    title,
    url: '',
    origin: new URL(url).origin,
    view: previewView,
  };
  state.tabs.push(tab);

  const wc = previewView.webContents;

  // Track console errors for this tab
  tab.consoleErrors = 0;

  function reportConsoleError(message = '') {
    tab.consoleErrors = (tab.consoleErrors || 0) + 1;

    console.log(
  `[Static] Console error in ${tab.id}: #${tab.consoleErrors}`,
  message
  );

    if (win.isDestroyed()) return;

    win.webContents.send('preview-console-error', {
      tabId: tab.id,
      count: tab.consoleErrors,
    });

    sendTabsChanged(win);
  }

// Normal console.error(), console.warn(), etc.
  wc.on('console-message', (_event, levelOrDetails, message) => {
    const level =
    typeof levelOrDetails === 'object'
    ? levelOrDetails?.level
    : levelOrDetails;

    if (level === 'error' || level === 3) {
      reportConsoleError(message);
    }
  });

// Uncaught JavaScript errors
  wc.on('did-finish-load', () => {
    if (wc.isDestroyed()) return;

    wc.executeJavaScript(`
    (() => {
      if (window.__staticErrorHooksInstalled) return;
      window.__staticErrorHooksInstalled = true;

      window.addEventListener('error', (event) => {
        console.error(
          '[Static uncaught]',
          event.message || 'Unknown JavaScript error'
        );
      });

      window.addEventListener('unhandledrejection', (event) => {
        console.error(
          '[Static unhandled rejection]',
          event.reason?.message ||
          String(event.reason || 'Unhandled promise rejection')
        );
      });
    })();
    `).catch(() => {});
  });

  wc.on('did-start-loading', () => sendLoadState(win, true));
  wc.on('did-stop-loading', () => sendLoadState(win, false));
  wc.on('did-fail-load', (_e, code) => {
    if (code !== -3) sendLoadState(win, false);
  });
  // Network- and HTTP-level failures (404s, connection errors, etc.) are
  // reported globally via installNetworkErrorTracking()/session.webRequest
  // instead of here, since did-fail-load's errorCode never reflects HTTP
  // status codes and webRequest can see both main-frame and subresource
  // requests in one place.
  wc.on('did-navigate', () => {
    tab.url = wc.getURL() || tab.url;
    tab.origin = new URL(tab.url || url).origin;
    sendNavState(win);
    sendUrlChanged(win, tab.url);
    sendTabsChanged(win);
  });
  wc.on('did-navigate-in-page', () => {
    tab.url = wc.getURL() || tab.url;
    tab.origin = new URL(tab.url || url).origin;
    sendNavState(win);
    sendUrlChanged(win, tab.url);
    sendTabsChanged(win);
  });
  wc.on('did-stop-loading', () => {
    tab.url = wc.getURL() || tab.url;
    tab.origin = new URL(tab.url || url).origin;
    sendNavState(win);
    sendUrlChanged(win, tab.url);
    sendTabsChanged(win);
  });
  wc.on('page-title-updated', (_event, titleText) => {
    if (titleText) {
      tab.title = titleText;
      sendTabsChanged(win);
    }
  });

  wc.setWindowOpenHandler(({ url: popupUrl }) => {
    const popupTab = addPreviewTab(win, { url: popupUrl, title: popupUrl, loadImmediately: true });
    if (popupTab) activateTab(win, popupTab.id);
    return { action: 'deny' };
  });

  const initialPreviewUrl = new URL(startPath || '/', url).toString();
  activateTab(win, tab.id);
  loadTabUrl(win, tab, initialPreviewUrl);
  updatePreviewViewBounds(win);
  sendTabsChanged(win);
  return tab;
}

function cleanupPreviewWindow(win) {
  previewWindows = previewWindows.filter((entry) => entry.win !== win);
  if (previewWindows.length === 0) {
    killServer();
    if (!launcherWin || launcherWin.isDestroyed()) {
      app.quit();
    }
  }
}

async function clearPreviewData() {
  const ses = session.defaultSession;

  // Clear Chromium's HTTP cache.
  await ses.clearCache();

  // Clear site data that can make one project appear in another:
  // localStorage, IndexedDB, cookies, service workers, etc.
  await ses.clearStorageData({
    storages: [
      'appcache',
      'cookies',
      'filesystem',
      'indexdb',
      'localstorage',
      'serviceworkers',
      'cachestorage',
      'websql',
    ],
  });
}

function createPreviewWindow(url, startPath = '/') {
  installPreviewKeyboardShortcuts();
  const previewWin = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 640,
    minHeight: 420,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: true,
    vibrancy: 'hud',
    visualEffectState: 'active',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload-preview.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  previewWindows.push({ win: previewWin, tabs: [], activeTabId: null });
  updatePreviewViewBounds(previewWin);

  previewWin.on('resize', () => updatePreviewViewBounds(previewWin));

  previewWin.loadFile(path.join(__dirname, 'renderer', 'preview.html'), {
    query: { url: new URL(startPath || '/', url).toString() },
  });

  previewWin.webContents.once('did-finish-load', () => {
    addPreviewTab(previewWin, {
      url,
      title: 'Preview',
      startPath,
      loadImmediately: false,
    });
  });

  previewWin.once('ready-to-show', () => {
    if (launcherWin && !launcherWin.isDestroyed()) launcherWin.close();
    previewWin.show();
  });

  previewWin.on('closed', () => {
    cleanupPreviewWindow(previewWin);
  });

  return previewWin;
}

// ---------------------------------------------------------------------------
// Shared "boot a folder" flow — used by the launcher UI AND the CLI
// ---------------------------------------------------------------------------
async function launchFolder(folderPath, startPath = '/') {
  const resolved = path.resolve(folderPath.replace(/^~(?=$|\/)/, os.homedir()));

  if (!fs.existsSync(resolved)) {
    throw new Error(`Folder not found: ${resolved}`);
  }
  if (!fs.statSync(resolved).isDirectory()) {
    throw new Error('Please point Static at a folder, not a file.');
  }

  servingFolder = resolved;

// Make sure the previous project's cached site data cannot leak
// into this project.
  await clearPreviewData();

  await startHttpServer(resolved, servingPort);
  const url = `http://localhost:${servingPort}`;
  await waitForServerReady(url);
  createPreviewWindow(url, startPath);
  return url;
}

// ---------------------------------------------------------------------------
// CLI: `static ~/Folder` — resolve a folder argument passed on launch
// ---------------------------------------------------------------------------
function resolveCliFolder() {
  // In dev (`electron .`)      argv = [electronBin, projectDir, ...userArgs]
  // Packaged app / bin wrapper argv = [appBin, ...userArgs]
  const args = app.isPackaged ? process.argv.slice(1) : process.argv.slice(2);
  for (const arg of args) {
    if (!arg || arg.startsWith('-') || arg === '.') continue;
    return arg;
  }
  return null;
}

// ---------------------------------------------------------------------------
// IPC
// ---------------------------------------------------------------------------
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(launcherWin, {
    properties: ['openDirectory'],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

ipcMain.handle('start-preview', async (_event, folderPath, startPath) => {
  const url = await launchFolder(folderPath, startPath);
  return url;
});

ipcMain.handle('get-browsers', async () => {
  return detectInstalledBrowsers();
});

ipcMain.handle('get-serving-info', () => ({
  folder: servingFolder,
  port: servingPort,
}));

ipcMain.on('open-in-browser', (event, { appName, url }) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const state = getPreviewState(win);
  const activeTab = getActiveTab(state);
  const targetUrl = activeTab?.url || url;
  if (targetUrl) openUrlInBrowser(appName, targetUrl);
});

ipcMain.on('open-native-devtools', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const state = getPreviewState(win);
  // Real DevTools, inspecting the actual served page — detached so it
  // doesn't eat into the preview window's own layout.
  const activeTab = getActiveTab(state);
  if (activeTab?.view) {
    activeTab.view.webContents.openDevTools({ mode: 'detach' });
  }
});

ipcMain.on('reload-preview', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const state = getPreviewState(win);
  const activeTab = getActiveTab(state);
  if (activeTab?.view) activeTab.view.webContents.reload();
});

ipcMain.on('nav-back', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const state = getPreviewState(win);
  const activeTab = getActiveTab(state);
  if (activeTab?.view && activeTab.view.webContents.canGoBack()) {
    activeTab.view.webContents.goBack();
  }
});

ipcMain.on('nav-forward', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const state = getPreviewState(win);
  const activeTab = getActiveTab(state);
  if (activeTab?.view && activeTab.view.webContents.canGoForward()) {
    activeTab.view.webContents.goForward();
  }
});

ipcMain.on('select-preview-tab', (event, { tabId }) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (tabId) activateTab(win, tabId);
});

ipcMain.on('close-preview-tab', (event, { tabId }) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const state = getPreviewState(win);
  if (!state) return;

  const index = state.tabs.findIndex((tab) => tab.id === tabId);
  if (index < 0) return;

  const tab = state.tabs[index];
  if (tab?.view) {
    try {
      win.contentView.removeChildView(tab.view);
    } catch (err) {
      // ignore
    }
  }
  state.tabs.splice(index, 1);

  if (state.tabs.length === 0) {
    win.close();
    return;
  }

  const nextTabId = state.tabs[Math.max(0, index - 1)].id;
  activateTab(win, nextTabId);
});

ipcMain.on('navigate-preview', (event, { url }) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const state = getPreviewState(win);
  const activeTab = getActiveTab(state);
  if (!activeTab?.view) return;

  const targetUrl = new URL(url, activeTab.origin || 'http://localhost:9090').toString();
  activeTab.origin = new URL(targetUrl).origin;
  loadTabUrl(win, activeTab, targetUrl);
});

ipcMain.on('stop-and-close', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.close();
  else app.quit();
});

ipcMain.on('minimize-window', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.minimize();
});

function installPreviewKeyboardShortcuts() {
  const isMac = process.platform === 'darwin';

  const template = [
    // The bolded app-name menu (macOS only — on Win/Linux this section is
    // skipped and its quit/hide items live under File instead).
    ...(isMac
      ? [
          {
            label: 'Static',
            submenu: [
              { label: 'About Static', role: 'about' },
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' },
            ],
          },
        ]
      : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'Reveal Project in Finder',
          accelerator: 'CmdOrCtrl+Shift+F',
          click: () => {
            if (servingFolder) shell.showItemInFolder(servingFolder);
          },
        },
        {
          label: 'Copy Preview URL',
          accelerator: 'CmdOrCtrl+Shift+C',
          click: (_menuItem, browserWindow) => {
            const activeTab = getActiveTab(getPreviewState(browserWindow));
            if (activeTab?.url) clipboard.writeText(activeTab.url);
          },
        },
        { type: 'separator' },
        {
          label: 'Toggle DevTools',
          accelerator: 'CmdOrCtrl+Alt+I',
          click: (_menuItem, browserWindow) => {
            if (!browserWindow || browserWindow.isDestroyed()) return;
            const state = getPreviewState(browserWindow);
            const activeTab = getActiveTab(state);
            if (activeTab?.view && !activeTab.view.webContents.isDestroyed()) {
              activeTab.view.webContents.toggleDevTools();
            }
          },
        },
        { type: 'separator' },
        isMac ? { role: 'close', label: 'Close Window' } : { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Reload Preview',
          accelerator: 'CmdOrCtrl+R',
          click: (_menuItem, browserWindow) => {
            if (!browserWindow || browserWindow.isDestroyed()) return;

            const state = getPreviewState(browserWindow);
            const activeTab = getActiveTab(state);

            if (activeTab?.view && !activeTab.view.webContents.isDestroyed()) {
              activeTab.view.webContents.reload();
            }
          },
        },
        {
          label: 'Force Reload Preview',
          accelerator: 'CmdOrCtrl+Shift+R',
          click: (_menuItem, browserWindow) => {
            if (!browserWindow || browserWindow.isDestroyed()) return;

            const state = getPreviewState(browserWindow);
            const activeTab = getActiveTab(state);

            if (activeTab?.view && !activeTab.view.webContents.isDestroyed()) {
              activeTab.view.webContents.reloadIgnoringCache();
            }
          },
        },
        { type: 'separator' },
        {
          label: 'Zoom In',
          accelerator: 'CmdOrCtrl+Plus',
          click: (_menuItem, browserWindow) => {
            const activeTab = getActiveTab(getPreviewState(browserWindow));
            const wc = activeTab?.view?.webContents;
            if (wc && !wc.isDestroyed()) wc.setZoomLevel(wc.getZoomLevel() + 0.5);
          },
        },
        {
          label: 'Zoom Out',
          accelerator: 'CmdOrCtrl+-',
          click: (_menuItem, browserWindow) => {
            const activeTab = getActiveTab(getPreviewState(browserWindow));
            const wc = activeTab?.view?.webContents;
            if (wc && !wc.isDestroyed()) wc.setZoomLevel(wc.getZoomLevel() - 0.5);
          },
        },
        {
          label: 'Actual Size',
          accelerator: 'CmdOrCtrl+0',
          click: (_menuItem, browserWindow) => {
            const activeTab = getActiveTab(getPreviewState(browserWindow));
            const wc = activeTab?.view?.webContents;
            if (wc && !wc.isDestroyed()) wc.setZoomLevel(0);
          },
        },
      ],
    },
    {
      label: 'Window',
      submenu: [
        {
          label: 'Open in Browser',
          accelerator: 'CmdOrCtrl+Shift+O',
          click: (_menuItem, browserWindow) => {
            const activeTab = getActiveTab(getPreviewState(browserWindow));
            if (activeTab?.url) shell.openExternal(activeTab.url);
          },
        },
        { type: 'separator' },
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'close', label: 'Close Window' },
        { type: 'separator' },
        { role: 'front' },
        { type: 'separator' },
        { role: 'quit', label: 'Quit Static' },
      ],
    },
    {
      // macOS turns a top-level "Help" menu with role: 'help' into the
      // native NSApp help menu, which gets the built-in search field for
      // free — typing there searches every item in every menu above.
      label: 'Help',
      role: 'help',
      submenu: [
        {
          label: 'Static on GitHub',
          click: () => shell.openExternal('https://github.com/codelinkd203/Static'),
        },
        {
          label: 'Report an Issue…',
          click: () => shell.openExternal('https://github.com/codelinkd203/Static/issues'),
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------
app.whenReady().then(async () => {
  installPreviewKeyboardShortcuts();

  const cliFolder = resolveCliFolder();
  if (cliFolder) {
    try {
      await launchFolder(cliFolder);
    } catch (err) {
      dialog.showErrorBox('Static', err.message || String(err));
      app.quit();
    }
  } else {
    createLauncherWindow();
  }
});

app.on('window-all-closed', () => {
  killServer();
  app.quit();
});

app.on('before-quit', () => {
  killServer();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createLauncherWindow();
});