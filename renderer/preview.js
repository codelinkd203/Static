const params = new URLSearchParams(window.location.search);
const initialPreviewUrl = params.get('url') || 'http://localhost:9090';

const loading = document.getElementById('contentLoading');
const addressInput = document.getElementById('addressInput');
const browserIconsEl = document.getElementById('browserIcons');
const tabStripEl = document.getElementById('tabStrip');
const backBtn = document.getElementById('backBtn');
const forwardBtn = document.getElementById('forwardBtn');
const reloadBtn = document.getElementById('reloadBtn');
const devtoolsBtn = document.getElementById('devtoolsBtn');
const openBtn = document.getElementById('openBtn');
const closeBtn = document.getElementById('closeBtn');

let browsers = [];
let selectedBrowser = null;
let currentUrl = initialPreviewUrl;
let tabs = [];
let activeTabId = null;

const { normalizePreviewInput, getDisplayAddress } = window.previewUrlHelpers;

function syncAddressBar(url) {
  currentUrl = url || initialPreviewUrl;
  if (addressInput) {
    addressInput.value = getDisplayAddress(currentUrl, initialPreviewUrl);
  }
}

syncAddressBar(initialPreviewUrl);

// --- Loading indicator, driven by the main process's WebContentsView ------
window.previewAPI.onLoadState(({ loading: isLoading }) => {
  loading.classList.toggle('visible', isLoading);
});

// --- Back/forward availability, driven by the main process ---------------
window.previewAPI.onNavState(({ canGoBack, canGoForward }) => {
  backBtn.disabled = !canGoBack;
  forwardBtn.disabled = !canGoForward;
});

window.previewAPI.onUrlChanged(({ url }) => {
  syncAddressBar(url);
});

window.previewAPI.onTabsChanged(({ tabs: nextTabs, activeTabId: nextActiveTabId }) => {
  tabs = nextTabs || [];
  activeTabId = nextActiveTabId;
  renderTabs();
});

function renderTabs() {
  if (!tabStripEl) return;
  tabStripEl.innerHTML = '';
  if (!tabs || tabs.length <= 1) {
    tabStripEl.style.display = 'none';
    return;
  }

  tabStripEl.style.display = 'flex';
  tabs.forEach((tab) => {
    const pill = document.createElement('div');
    pill.className = 'tab-pill' + (tab.id === activeTabId ? ' active' : '');
    pill.title = tab.url || tab.title || 'Preview';

    const label = document.createElement('span');
    label.className = 'tab-title';
    label.textContent = tab.title || 'Preview';
    label.addEventListener('click', () => {
      window.previewAPI.selectTab(tab.id);
    });

    const close = document.createElement('button');
    close.textContent = '×';
    close.title = 'Close tab';
    close.addEventListener('click', (event) => {
      event.stopPropagation();
      window.previewAPI.closeTab(tab.id);
    });

    pill.appendChild(label);
    pill.appendChild(close);
    tabStripEl.appendChild(pill);
  });
}

// --- Browser icon row -------------------------------------------------
function renderBrowserIcons() {
  browserIconsEl.innerHTML = '';
  browsers.forEach((browser) => {
    const btn = document.createElement('button');
    btn.className = 'browser-btn' + (browser.id === selectedBrowser?.id ? ' selected' : '');
    btn.title = browser.label;
    btn.setAttribute('aria-label', browser.label);

    if (browser.icon) {
      const img = document.createElement('img');
      img.alt = browser.label;
      img.onerror = () => {
        // The data URL didn't decode into a real image — fall back to a
        // letter avatar instead of leaving a broken-image glyph on screen.
        btn.textContent = browser.label[0];
      };
      img.src = browser.icon;
      btn.appendChild(img);
    } else {
      // Only reached if both the native icon lookup and the .icns fallback
      // in main.js failed — a same-color initial keeps it from looking broken.
      btn.textContent = browser.label[0];
    }

    btn.addEventListener('click', () => {
      selectedBrowser = browser;
      renderBrowserIcons();
      window.previewAPI.openInBrowser(browser.appName, currentUrl);
    });

    browserIconsEl.appendChild(btn);
  });
}

async function loadBrowsers() {
  browsers = await window.previewAPI.getBrowsers();
  if (browsers.length > 0) selectedBrowser = browsers[0];
  renderBrowserIcons();
}

loadBrowsers();

// --- Toolbar actions -----------------------------------------------------
backBtn.addEventListener('click', () => {
  window.previewAPI.navBack();
});

forwardBtn.addEventListener('click', () => {
  window.previewAPI.navForward();
});

reloadBtn.addEventListener('click', () => {
  window.previewAPI.reloadPreview();
});

devtoolsBtn.addEventListener('click', () => {
  window.previewAPI.openNativeDevtools();
});

openBtn.addEventListener('click', () => {
  const target = selectedBrowser;
  if (!target) return;
  window.previewAPI.openInBrowser(target.appName, currentUrl);
});

closeBtn.addEventListener('click', () => {
  window.previewAPI.stopAndClose();
});

if (addressInput) {
  addressInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      const target = normalizePreviewInput(initialPreviewUrl, addressInput.value);
      window.previewAPI.navigateTo(target);
      syncAddressBar(target);
    }
  });

  addressInput.addEventListener('blur', () => {
    syncAddressBar(currentUrl);
  });
}