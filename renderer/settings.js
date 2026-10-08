const autoReloadCheckbox = document.getElementById('autoReloadCheckbox');
const showReloadNoticeCheckbox = document.getElementById('showReloadNoticeCheckbox');
const errorCounterCheckbox = document.getElementById('errorCounterCheckbox');
const devtoolsDetachedCheckbox = document.getElementById('devtoolsDetachedCheckbox');


function loadSettings() {
  window.settingsAPI.getSettings().then((settings) => {
    autoReloadCheckbox.checked = !!settings?.autoReload;
    showReloadNoticeCheckbox.checked = !settings?.suppressReloadToast;
    errorCounterCheckbox.checked = settings?.devtoolsErrorCounterEnabled !== false;
    devtoolsDetachedCheckbox.checked = !!settings?.devtoolsDetached;
  });
}

loadSettings();

autoReloadCheckbox.addEventListener('change', () => {
  window.settingsAPI.setSetting('autoReload', autoReloadCheckbox.checked);
});

showReloadNoticeCheckbox.addEventListener('change', () => {
  window.settingsAPI.setSetting('suppressReloadToast', !showReloadNoticeCheckbox.checked);
});

errorCounterCheckbox.addEventListener('change', () => {
  window.settingsAPI.setSetting('devtoolsErrorCounterEnabled', errorCounterCheckbox.checked);
});

devtoolsDetachedCheckbox.addEventListener('change', () => {
  window.settingsAPI.setSetting('devtoolsDetached', devtoolsDetachedCheckbox.checked);
});

// ---------------------------------------------------------------------------
// Tabs (General / Shortcuts)
// ---------------------------------------------------------------------------
const segThumb = document.getElementById('segThumb');
const tabButtons = Array.from(document.querySelectorAll('.seg-btn'));
const views = {
  general: document.getElementById('viewGeneral'),
  shortcuts: document.getElementById('viewShortcuts'),
};
const viewsScroller = document.querySelector('.views');

function positionThumb(button) {
  segThumb.style.width = `${button.offsetWidth}px`;
  segThumb.style.setProperty('--thumb-x', `${button.offsetLeft}px`);
}

function selectTab(name) {
  tabButtons.forEach((btn) => {
    const active = btn.dataset.tab === name;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-selected', String(active));
    if (active) positionThumb(btn);
  });
  Object.entries(views).forEach(([key, el]) => el.classList.toggle('is-active', key === name));
  viewsScroller.scrollTop = 0;
}

tabButtons.forEach((btn) => btn.addEventListener('click', () => selectTab(btn.dataset.tab)));

// Place the thumb without animating it on first paint.
segThumb.style.transition = 'none';
positionThumb(document.querySelector('.seg-btn.is-active'));
requestAnimationFrame(() => requestAnimationFrame(() => { segThumb.style.transition = ''; }));

// ---------------------------------------------------------------------------
// Keyboard shortcuts list (mirrors the app menu in main.js)
// ---------------------------------------------------------------------------
const SHORTCUT_GROUPS = [
  {
    title: 'Preview',
    items: [
      ['Reload Preview', ['⌘', 'R']],
      ['Force Reload', ['⇧', '⌘', 'R']],
      ['Open in Browser', ['⇧', '⌘', 'O']],
      ['Copy Preview URL', ['⇧', '⌘', 'C']],
      ['Reveal Project in Finder', ['⇧', '⌘', 'F']],
      ['Toggle DevTools', ['⌥', '⌘', 'I']],
    ],
  },
  {
    title: 'View',
    items: [
      ['Zoom In', ['⌘', '+']],
      ['Zoom Out', ['⌘', '−']],
      ['Actual Size', ['⌘', '0']],
    ],
  },
  {
    title: 'App & Window',
    items: [
      ['Settings', ['⌘', ',']],
      ['Close Window', ['⌘', 'W']],
      ['Minimize', ['⌘', 'M']],
      ['Hide Static', ['⌘', 'H']],
      ['Hide Others', ['⌥', '⌘', 'H']],
      ['Quit Static', ['⌘', 'Q']],
    ],
  },
  {
    title: 'Editing',
    items: [
      ['Undo', ['⌘', 'Z']],
      ['Redo', ['⇧', '⌘', 'Z']],
      ['Cut', ['⌘', 'X']],
      ['Copy', ['⌘', 'C']],
      ['Paste', ['⌘', 'V']],
      ['Select All', ['⌘', 'A']],
    ],
  },
];

const MODIFIER_KEYS = new Set(['⌘', '⇧', '⌥', '⌃']);

function renderShortcuts() {
  const host = document.getElementById('shortcutList');
  SHORTCUT_GROUPS.forEach((group) => {
    const section = document.createElement('section');
    section.className = 'group';

    const heading = document.createElement('h2');
    heading.textContent = group.title;
    section.appendChild(heading);

    const card = document.createElement('div');
    card.className = 'card';

    group.items.forEach(([label, keys]) => {
      const row = document.createElement('div');
      row.className = 'sc-row';

      const name = document.createElement('span');
      name.className = 'sc-label';
      name.textContent = label;

      const keysEl = document.createElement('span');
      keysEl.className = 'keys';
      keys.forEach((key) => {
        const cap = document.createElement('kbd');
        if (MODIFIER_KEYS.has(key)) cap.className = 'mod';
        cap.textContent = key;
        keysEl.appendChild(cap);
      });

      row.append(name, keysEl);
      card.appendChild(row);
    });

    section.appendChild(card);
    host.appendChild(section);
  });
}

renderShortcuts();

// ---------------------------------------------------------------------------
// About + Esc to close
// ---------------------------------------------------------------------------
document.getElementById('aboutBtn').addEventListener('click', () => {
  window.settingsAPI.openAbout();
});

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') window.close();
});