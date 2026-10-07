const toast = document.getElementById('toast');
const toastBody = document.getElementById('toastBody');
const closeBtn = document.getElementById('closeBtn');
const settingsBtn = document.getElementById('settingsBtn');
const options = document.getElementById('options');
const autoReloadCheckbox = document.getElementById('autoReloadCheckbox');
const suppressCheckbox = document.getElementById('suppressCheckbox');

function show() {
  toast.classList.add('visible');
}

function hide() {
  toast.classList.remove('visible');
  options.classList.remove('visible');
  // Give the fade-out transition time to actually play before the native
  // overlay view is hidden — otherwise it vanishes as a hard cut.
  setTimeout(() => window.reloadToastAPI.hideNative(), 200);
}

window.reloadToastAPI.onShow(() => show());

window.reloadToastAPI.getSettings().then((settings) => {
  autoReloadCheckbox.checked = !!settings?.autoReload;
  suppressCheckbox.checked = !!settings?.suppressReloadToast;
});

toastBody.addEventListener('click', () => {
  window.reloadToastAPI.reloadNow();
  hide();
});

closeBtn.addEventListener('click', (event) => {
  event.stopPropagation();
  hide();
});

settingsBtn.addEventListener('click', (event) => {
  event.stopPropagation();
  options.classList.toggle('visible');
});

document.addEventListener('click', (event) => {
  if (options.classList.contains('visible') && !options.contains(event.target) && event.target !== settingsBtn) {
    options.classList.remove('visible');
  }
});

autoReloadCheckbox.addEventListener('change', () => {
  window.reloadToastAPI.setSetting('autoReload', autoReloadCheckbox.checked);
  // Once auto-reload is on, future changes reload silently — no point
  // leaving a stale prompt sitting on screen.
  if (autoReloadCheckbox.checked) hide();
});

suppressCheckbox.addEventListener('change', () => {
  window.reloadToastAPI.setSetting('suppressReloadToast', suppressCheckbox.checked);
  if (suppressCheckbox.checked) hide();
});
