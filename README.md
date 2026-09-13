<p align="center">
  <a href="https://github.com/codelinkd203/Static">
    <img src="renderer/assets/logo.png" alt="Static Logo" width="160"/>
  </a>
</p>

<h1 align="center">Static</h1>

<p align="center">
  Instantly preview local websites with a beautiful, native macOS experience.
</p>

<br>

## What is Static?

Static is a lightweight macOS utility for previewing local websites without the hassle of setting up a development server.

Simply drop a folder onto Static and your website is instantly available in a clean, Quick Look-style preview window. You can browse your project, reload it, open it in another browser, and access developer tools — all without leaving Static.

Whether you're testing a small HTML page or working on an entire website, Static keeps local previews simple.

## The Problem

Previewing a local website can often mean:

* Opening Terminal and starting a development server
* Remembering commands and ports
* Manually navigating to `localhost`
* Switching between your editor and browser
* Repeating the same setup every time you want to test something

For simple websites, that's a lot of unnecessary work.

## The Solution

Static turns the entire process into one simple action:

**Drop a folder → Preview your website.**

No project configuration. No setup files. No complicated workflow.

## Features

* **Instant Previews** — Drop a folder and start browsing immediately
* **Beautiful Native Interface** — Designed specifically for macOS
* **Quick Look-Style Window** — Preview your site in a clean, focused window
* **Browser Shortcuts** — Quickly open your project in any supported browser installed on your Mac
* **Automatic Browser Detection** — Only browsers actually installed on your Mac are shown
* **Live Reloading** — Refresh your website instantly from the toolbar
* **Developer Tools** — Inspect and debug your website when you need to
* **Drag & Drop** — Drop any website folder directly onto Static
* **Folder Browser** — Choose a project using the standard macOS file picker
* **Command-Line Support** — Open projects directly from Terminal
* **Multiple Projects** — Quickly switch between projects and previews
* **No Configuration Required** — Works out of the box with existing website folders
* **Native macOS Feel** — Smooth animations, translucency, and familiar macOS controls

## Getting Started

### Drag & Drop

The easiest way to use Static:

1. Open Static
2. Drag a website folder onto the window
3. Your website opens instantly

That's it.

### Browse for a Folder

You can also choose a folder using the **Browse** button and Static will immediately open a preview of it.

## Command Line

Static can also be launched directly from Terminal.

```bash
static ~/Projects/my-site
```

This opens the specified folder directly in Static without showing the launcher first.

You can also preview the current directory:

```bash
static .
```

Running Static without a folder opens the normal launcher:

```bash
static
```

## Your Browser, Your Choice

Static doesn't lock you into a single browser.

When you open a preview, Static detects the browsers installed on your Mac and provides quick shortcuts to open the current project in them.

This makes it easy to test your website across different browsers without manually finding the project URL every time.

## Built for macOS

Static is designed specifically around the macOS experience.

It takes advantage of familiar design patterns such as:

* Translucent windows
* Native window controls
* Smooth animations
* Minimal toolbars
* Quick Look-inspired previews
* Native file selection
* Installed application detection

The goal isn't to make a generic cross-platform tool.

**Static is made to feel like a Mac app.**

## Who Is Static For?

### Web Developers

Quickly preview websites while working on HTML, CSS, and JavaScript without repeatedly setting up a server.

### Designers

Preview static designs and prototypes without needing a full development environment.

### Students

Experiment with websites and projects without having to learn complicated tooling first.

### Anyone Working With Local Websites

If you have a folder containing a website, Static gives you an easy way to see it.

## Use Cases

Static is useful for:

* HTML/CSS/JavaScript projects
* Website prototypes
* Static websites
* Documentation sites
* Design mockups
* Web experiments
* School projects
* Landing pages
* Local website testing
* Quick browser testing

## Why Static?

Static is built around one idea:

> **Local websites shouldn't require a complicated workflow just to preview them.**

Open Static, choose your folder, and get straight to your website.

No configuration screens.

No project setup.

No unnecessary complexity.

Just **Static**.

## Development

Clone the repository and install the required dependencies:

```bash
git clone https://github.com/codelinkd203/Static.git
cd Static
npm install
```

Start Static in development mode:

```bash
npm start
```

### Building

Static can also be packaged as a native macOS application:

```bash
npm run dist
```

The resulting application can be installed and launched like any other Mac app.

## Contributing

Contributions are welcome!

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/improvement`)
3. Make your changes
4. Commit your changes (`git commit -m 'Add improvement'`)
5. Push your branch (`git push origin feature/improvement`)
6. Open a Pull Request

For larger changes, opening an issue first is recommended so the idea can be discussed before implementation.

## License

Static is released under the **MIT License**.

See [LICENSE](LICENSE) for the full license text.

## Support

* **Issues**: [GitHub Issues](https://github.com/codelinkd203/Static/issues)
* **Discussions**: [GitHub Discussions](https://github.com/codelinkd203/Static/discussions)
* **Source Code**: [GitHub Repository](https://github.com/codelinkd203/Static)
* **Star the repository** if you like Static!

---

<p align="center">
  Made for macOS.
</p>

<p align="center">
  <strong>Drop a folder. Preview your website. That's Static.</strong>
</p>
