// ---------------------------------------------------------------------------
// Self-updater (macOS) — checks package.json on main via jsDelivr, and if a
// newer version exists, downloads the right DMG for this Mac (Apple silicon or
// Intel), copies the new Static.app out of it, then swaps it in after the
// running app quits and relaunches.
// ---------------------------------------------------------------------------
const { app, BrowserWindow, dialog, net, shell } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { promisify } = require('util');
const { Readable, Transform } = require('stream');
const { pipeline } = require('stream/promises');
const { execFile, spawn, execFileSync } = require('child_process');

const run = promisify(execFile);

const REPO = 'codelinkd203/Static';
const VERSION_URL = `https://cdn.jsdelivr.net/gh/${REPO}@main/package.json`;
const dmgUrl = (version, file) => `https://github.com/${REPO}/releases/download/v${version}/${file}`;
const releasePageUrl = (version) => `https://github.com/${REPO}/releases/tag/v${version}`;

let busy = false;

// --- helpers ---------------------------------------------------------------
function parseVersion(v) {
  const [core, pre] = String(v).replace(/^v/, '').split('-');
  const nums = core.split('.').map((n) => parseInt(n, 10) || 0);
  while (nums.length < 3) nums.push(0);
  return { nums, pre: !!pre };
}

function isNewer(remote, local) {
  const r = parseVersion(remote);
  const l = parseVersion(local);
  for (let i = 0; i < 3; i++) {
    if (r.nums[i] !== l.nums[i]) return r.nums[i] > l.nums[i];
  }
  return l.pre && !r.pre; // 3.1.0 is newer than 3.1.0-beta
}

// Real hardware, not process.arch: an Intel build running under Rosetta on an
// M-series Mac reports "x64", but should be updated to the arm64 build.
function macArch() {
  try {
    const out = execFileSync('/usr/sbin/sysctl', ['-n', 'hw.optional.arm64'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    if (out.trim() === '1') return 'arm64';
  } catch {
    /* key doesn't exist on Intel Macs */
  }
  return process.arch === 'arm64' ? 'arm64' : 'x64';
}

// .../Static.app/Contents/MacOS/Static  ->  .../Static.app
function currentBundlePath() {
  const p = path.resolve(process.execPath, '..', '..', '..');
  return p.endsWith('.app') ? p : null;
}

function installProblem(bundle) {
  if (!bundle) return 'Static could not find its own app bundle.';
  if (bundle.startsWith('/Volumes/') || bundle.includes('/AppTranslocation/')) {
    return 'Static is running from a disk image. Drag it into Applications first.';
  }
  try {
    fs.accessSync(path.dirname(bundle), fs.constants.W_OK);
  } catch {
    return `Static doesn't have permission to modify ${path.dirname(bundle)}.`;
  }
  return null;
}

function setProgress(p) {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.setProgressBar(p);
  }
}

async function fetchLatestVersion() {
  const res = await net.fetch(VERSION_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Version check failed (HTTP ${res.status})`);
  const pkg = await res.json();
  if (!pkg || typeof pkg.version !== 'string') throw new Error('No version in package.json');
  return pkg.version.replace(/^v/, '');
}

async function download(url, dest) {
  const res = await net.fetch(url); // follows GitHub's redirect to the asset CDN
  if (!res.ok || !res.body) throw new Error(`Download failed (HTTP ${res.status})`);
  const total = Number(res.headers.get('content-length')) || 0;
  let got = 0;
  const counter = new Transform({
    transform(chunk, _enc, cb) {
      got += chunk.length;
      if (total) setProgress(got / total);
      cb(null, chunk);
    },
  });
  await pipeline(Readable.fromWeb(res.body), counter, fs.createWriteStream(dest));
  if (total && got !== total) throw new Error('Download was incomplete.');
}

function readBundleVersion(bundlePath) {
  const plist = fs.readFileSync(path.join(bundlePath, 'Contents', 'Info.plist'), 'utf8');
  const m = plist.match(/<key>CFBundleShortVersionString<\/key>\s*<string>([^<]+)<\/string>/);
  return m ? m[1] : null;
}

// Runs after Static exits: wait for the old process, swap bundles (rolling back
// if the swap fails), clear quarantine, relaunch.
const SWAP_SCRIPT = `
PID="$1"; TARGET="$2"; NEW="$3"; OLD="$TARGET.old-update"
i=0
while kill -0 "$PID" 2>/dev/null && [ "$i" -lt 100 ]; do sleep 0.2; i=$((i+1)); done
rm -rf "$OLD"
if mv "$TARGET" "$OLD"; then
  if mv "$NEW" "$TARGET"; then rm -rf "$OLD"; else mv "$OLD" "$TARGET"; fi
fi
rm -rf "$NEW"
/usr/bin/xattr -dr com.apple.quarantine "$TARGET" 2>/dev/null
/usr/bin/open "$TARGET"
`;

async function installUpdate(version) {
  const bundle = currentBundlePath();
  const problem = installProblem(bundle);
  if (problem) throw new Error(problem);

  const file = `Static.${macArch()}.dmg`;
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'static-update-'));
  const dmg = path.join(work, file);
  const mnt = path.join(work, 'mnt');
  fs.mkdirSync(mnt);
  const staged = path.join(path.dirname(bundle), '.Static-update.app');
  let mounted = false;

  try {
    await download(dmgUrl(version, file), dmg);
    setProgress(2); // indeterminate-looking tail while we mount + copy

    await run('/usr/bin/hdiutil', ['attach', dmg, '-nobrowse', '-noautoopen', '-readonly', '-mountpoint', mnt]);
    mounted = true;

    const appName = fs.readdirSync(mnt).find((n) => n.endsWith('.app'));
    if (!appName) throw new Error('No app found inside the downloaded disk image.');

    fs.rmSync(staged, { recursive: true, force: true });
    await run('/usr/bin/ditto', [path.join(mnt, appName), staged]);

    if (!fs.existsSync(path.join(staged, 'Contents', 'MacOS'))) {
      throw new Error('The downloaded app looks incomplete.');
    }
    const gotVersion = readBundleVersion(staged);
    if (gotVersion !== version) {
      throw new Error(`Expected Static ${version} but the download contained ${gotVersion || 'an unknown version'}.`);
    }
  } catch (err) {
    fs.rmSync(staged, { recursive: true, force: true });
    throw err;
  } finally {
    if (mounted) await run('/usr/bin/hdiutil', ['detach', mnt, '-force']).catch(() => {});
    fs.rmSync(work, { recursive: true, force: true });
    setProgress(-1);
  }

  spawn('/bin/sh', ['-c', SWAP_SCRIPT, 'sh', String(process.pid), bundle, staged], {
    detached: true,
    stdio: 'ignore',
  }).unref();
  app.quit();
}

// --- public entry ----------------------------------------------------------
// manual=false: silent unless an update exists. manual=true: always answers.
async function checkForUpdates({ manual = false } = {}) {
  if (busy) return;
  if (!app.isPackaged || process.platform !== 'darwin') {
    if (manual) {
      await dialog.showMessageBox({ type: 'info', message: 'Updates are only available in the installed Static app.' });
    }
    return;
  }

  busy = true;
  try {
    let latest;
    try {
      latest = await fetchLatestVersion();
    } catch (err) {
      console.error('[Static] Update check failed:', err.message || err);
      if (manual) dialog.showErrorBox('Static', "Couldn't check for updates. Check your internet connection and try again.");
      return;
    }

    const current = app.getVersion();
    if (!isNewer(latest, current)) {
      if (manual) {
        await dialog.showMessageBox({ type: 'info', message: "You're up to date", detail: `Static ${current} is the latest version.` });
      }
      return;
    }

    const { response } = await dialog.showMessageBox({
      type: 'info',
      message: `Static ${latest} is available`,
      detail: `You have ${current}. Static will download the update, install it, and restart.`,
      buttons: ['Update Now', 'Later'],
      defaultId: 0,
      cancelId: 1,
    });
    if (response !== 0) return;

    try {
      await installUpdate(latest);
    } catch (err) {
      console.error('[Static] Update failed:', err);
      const choice = await dialog.showMessageBox({
        type: 'warning',
        message: "Static couldn't update itself",
        detail: `${err.message || err}\n\nYou can download Static ${latest} manually instead.`,
        buttons: ['Open Download Page', 'Cancel'],
        defaultId: 0,
        cancelId: 1,
      });
      if (choice.response === 0) shell.openExternal(releasePageUrl(latest));
    }
  } finally {
    busy = false;
  }
}

module.exports = { checkForUpdates, _test: { isNewer, parseVersion, SWAP_SCRIPT, download } };