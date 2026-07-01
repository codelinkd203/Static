# Static — Instant Local Web Preview

A native-feeling macOS utility: drop a folder, it's served on `localhost:9090`,
and a Quick-Look-style floating preview window opens with one-click access to
every browser installed on your Mac.

## Requirements

- macOS (uses `vibrancy`, `hiddenInset` title bars, and `/Applications` browser
  detection — this app is macOS-only by design)
- Node.js 18+
- Python 3 available on `PATH` as `python3` (falls back to `python`)

## Setup

```bash
cd static-app
npm install
npm start
```

## Project structure

```
static-app/
├── package.json
├── main.js                  # Electron main process: windows, server, IPC
├── preload.js                # contextBridge for the launcher window
├── preload-preview.js        # contextBridge for the preview window
├── renderer/
│   ├── launcher.html/.css/.js   # frosted-glass drop zone screen
│   └── preview.html/.css/.js    # Quick-Look style preview + toolbar
└── assets/                   # (optional) app icon for packaging
```

## How it works

1. **Launcher window** — frameless, transparent, `vibrancy: 'fullscreen-ui'`.
   Drag a folder in, or click Browse (native `dialog.showOpenDialog`).
2. **Server spawn** — `main.js` runs `python3 -m http.server 9090` with `cwd`
   set to the chosen folder, and polls `http://localhost:9090` with a raw
   `http.get` loop until it responds (up to 8s timeout).
3. **Preview window** — a second frameless/transparent/vibrant
   (`vibrancy: 'hud'`) `BrowserWindow` fades and scales in (`window-in`
   keyframes, 260ms) once the launcher closes. The served page itself is
   rendered by a `WebContentsView` attached directly to the window by
   `main.js` and positioned to exactly fill the area below the toolbar —
   not a `<webview>` guest tag, which is more prone to silently failing to
   load.
4. **Toolbar** — real installed-browser icons are detected by checking
   `/Applications/*.app`, pulling each app's actual icon via
   `app.getFileIcon()`, and falling back to reading the `.icns` directly out
   of the bundle's `Info.plist` if that returns nothing. Only installed
   browsers render, each with its real icon. Reload / DevTools / Open /
   Close are icon-only buttons on the right, separated by a hairline
   divider — DevTools opens Electron's actual inspector on the live served
   page (detached window), rather than launching a browser.
5. **Shutdown** — the ✕ button (or closing the preview window) sends
   `SIGTERM` to the Python process and quits the app.

## CLI usage — `static ~/Folder`

Yes, once set up:

```bash
static ~/Projects/my-site   # opens straight to the preview, skips the launcher
static .                    # serve the current directory
static                      # no folder → shows the drag & drop launcher, as normal
```

To wire the command up:

```bash
cd static-app
npm install
ln -s "$(pwd)/bin/static" /usr/local/bin/static   # Apple Silicon: /opt/homebrew/bin/static
```

(`bin/static` just calls the local `electron` binary with the project folder
as its entry point, so it needs `npm install` run once first. `package.json`
also declares a `bin` field, so `npm link` works as an alternative to the
symlink above if you'd rather not touch `/usr/local/bin` by hand.)

## Packaging

`electron-builder` config is included in `package.json`. Add a `.icns` file
at `assets/icon.icns` and run:

```bash
npm run dist
```
