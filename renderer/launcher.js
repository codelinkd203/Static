const dropzone = document.getElementById('dropzone');
const browseBtn = document.getElementById('browseBtn');
const statusEl = document.getElementById('status');

let busy = false;

function setStatus(text, kind) {
  statusEl.textContent = text || '\u00A0';
  statusEl.className = 'status' + (kind ? ` ${kind}` : '');
}

async function beginPreview(folderPath) {
  if (busy || !folderPath) return;
  busy = true;
  setStatus(`Starting server in “${folderPath.split('/').pop()}”…`, 'busy');
  try {
    await window.staticAPI.startPreview(folderPath);
    // On success the main process opens the preview window and closes
    // this one — nothing further to do here.
  } catch (err) {
    busy = false;
    setStatus(err.message || 'Something went wrong.', 'error');
  }
}

// --- Browse button -----------------------------------------------------
browseBtn.addEventListener('click', async () => {
  if (busy) return;
  const folder = await window.staticAPI.selectFolder();
  if (folder) beginPreview(folder);
});

// --- Drag & drop ---------------------------------------------------------
// Prevent Electron's default "navigate to dropped file" behavior anywhere
// in the window, then handle real drops only inside the dropzone.
['dragover', 'drop'].forEach((evt) => {
  window.addEventListener(evt, (e) => e.preventDefault());
});

dropzone.addEventListener('dragenter', (e) => {
  e.preventDefault();
  dropzone.classList.add('dragover');
});

dropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
});

dropzone.addEventListener('dragleave', (e) => {
  if (!dropzone.contains(e.relatedTarget)) {
    dropzone.classList.remove('dragover');
  }
});

dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('dragover');
  if (busy) return;

  const files = e.dataTransfer.files;
  if (!files || files.length === 0) return;

  const file = files[0];
  const realPath = window.staticAPI.getPathForFile(file);
  if (realPath) beginPreview(realPath);
  else setStatus('Could not resolve the dropped item to a path.', 'error');
});