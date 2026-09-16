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
