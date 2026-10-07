(function () {
  const params = new URLSearchParams(window.location.search);
  const ip = params.get('ip') || '';
  const port = params.get('port') || '9090';

  const card = document.getElementById('card');
  const qrBox = document.getElementById('qrBox');
  const urlEl = document.getElementById('qrUrl');
  const hintEl = document.getElementById('qrHint');

  if (ip) {
    try {
      const qr = qrcode(0, 'M'); // type 0 = pick the smallest size that fits
      qr.addData(`http://${ip}:${port}`);
      qr.make();
      qrBox.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 16, scalable: true });
      urlEl.textContent = `${ip}:${port}`;
    } catch (err) {
      qrBox.remove();
      urlEl.remove();
      hintEl.className = 'empty';
      hintEl.textContent = 'Could not generate a QR code.';
    }
  } else {
    qrBox.remove();
    urlEl.remove();
    hintEl.className = 'empty';
    hintEl.textContent = "Couldn't find a local network address. Connect to Wi-Fi and try again.";
  }

  requestAnimationFrame(() => requestAnimationFrame(() => card.classList.add('visible')));

  const close = () => window.qrAPI.close();
  document.getElementById('backdrop').addEventListener('click', close);
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });
})();
