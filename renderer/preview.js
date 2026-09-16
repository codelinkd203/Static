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
const consoleErrorBadge = document.getElementById('consoleErrorBadge');
const openBtn = document.getElementById('openBtn');
const appBrandBtn = document.getElementById('appBrandBtn');

appBrandBtn.addEventListener('click', () => {
  window.previewAPI.openSettings();
});

const closeBtn = document.getElementById('closeBtn');

let browsers = [];
let selectedBrowser = null;
let currentUrl = initialPreviewUrl;
let tabs = [];
let activeTabId = null;

window.previewAPI.onConsoleError(({ tabId, count }) => {
  const tab = tabs.find((t) => t.id === tabId);

  if (tab) {
    tab.consoleErrors = count;
  }

  if (tabId !== activeTabId) return;

  if (count > 0) {
    devtoolsBtn.classList.add('has-errors');
    consoleErrorBadge.textContent = count > 99 ? '99+' : String(count);
  } else {
    devtoolsBtn.classList.remove('has-errors');
    consoleErrorBadge.textContent = '0';
  }
});

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

  const activeTab = tabs.find((tab) => tab.id === activeTabId);
  const count = activeTab?.consoleErrors || 0;

  if (count > 0) {
    devtoolsBtn.classList.add('has-errors');
    consoleErrorBadge.textContent = count > 99 ? '99+' : String(count);
  } else {
    devtoolsBtn.classList.remove('has-errors');
    consoleErrorBadge.textContent = '0';
  }
});

// Keyed diff instead of wiping and rebuilding every pill on every update —
// title/error changes happen constantly, and re-creating the DOM each time
// was killing hover states and replaying transitions (the "janky" tab feel).
const tabPillEls = new Map(); // tabId -> pill element

function renderTabs() {
  if (!tabStripEl) return;

  tabStripEl.style.display = tabs && tabs.length > 1 ? 'flex' : 'none';

  const seen = new Set();

  (tabs || []).forEach((tab, index) => {
    seen.add(tab.id);
    let pill = tabPillEls.get(tab.id);

    if (!pill) {
      pill = document.createElement('div');
      pill.className = 'tab-pill tab-pill-entering';

      const label = document.createElement('span');
      label.className = 'tab-title';
      label.addEventListener('click', () => window.previewAPI.selectTab(tab.id));
      pill.appendChild(label);

      const close = document.createElement('button');
      close.textContent = '×';
      close.title = 'Close tab';
      close.addEventListener('click', (event) => {
        event.stopPropagation();
        window.previewAPI.closeTab(tab.id);
      });
      pill.appendChild(close);

      tabPillEls.set(tab.id, pill);
      tabStripEl.appendChild(pill);
      // Let the browser paint the "entering" state before removing it, so
      // the scale/opacity transition actually has something to animate from.
      requestAnimationFrame(() => requestAnimationFrame(() => {
        pill.classList.remove('tab-pill-entering');
      }));
    }

    // Keep DOM order in sync with tab order without touching pills that are
    // already in the right place (avoids restyle/reflow thrash).
    const currentNodeAtIndex = tabStripEl.children[index];
    if (currentNodeAtIndex !== pill) {
      tabStripEl.insertBefore(pill, currentNodeAtIndex || null);
    }

    pill.classList.toggle('active', tab.id === activeTabId);
    pill.title = tab.url || tab.title || 'Preview';
    const label = pill.querySelector('.tab-title');
    if (label.textContent !== (tab.title || 'Preview')) {
      label.textContent = tab.title || 'Preview';
    }
  });

  // Animate out and remove any pill whose tab is gone.
  for (const [tabId, pill] of tabPillEls) {
    if (seen.has(tabId)) continue;
    tabPillEls.delete(tabId);
    pill.classList.add('tab-pill-leaving');
    pill.addEventListener('transitionend', () => pill.remove(), { once: true });
    // Safety net in case no transition fires (e.g. reduced-motion settings).
    setTimeout(() => pill.remove(), 250);
  }
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