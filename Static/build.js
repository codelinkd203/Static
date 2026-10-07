const fs = require("fs");
const path = require("path");
const { spawn, exec } = require("child_process");
const readline = require("readline");

const root = __dirname;
const packagePath = path.join(root, "package.json");
const distPath = path.join(root, "dist");
const outputPath = path.join(root, "output");

// ─────────────────────────────────────────────
// colors
// ─────────────────────────────────────────────

const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  blue: "\x1b[34m",
  white: "\x1b[37m",
};

function log(message = "") {
  console.log(message);
}

function success(message) {
  console.log(`${c.green}✔${c.reset} ${message}`);
}

function info(message) {
  console.log(`${c.cyan}›${c.reset} ${message}`);
}

function warn(message) {
  console.log(`${c.yellow}⚠${c.reset} ${message}`);
}

function fail(message) {
  console.log(`${c.red}✖${c.reset} ${message}`);
}

// ─────────────────────────────────────────────
// progress bar
// ─────────────────────────────────────────────

function progress(label, percent) {
  const width = 30;
  const filled = Math.round(width * percent / 100);
  const empty = width - filled;

  const bar =
`${c.green}${"█".repeat(filled)}${c.dim}${"░".repeat(empty)}${c.reset}`;

process.stdout.write(
`\r${label} [${bar}] ${String(Math.round(percent)).padStart(3)}%`
);
}

// ─────────────────────────────────────────────
// ask for version
// ─────────────────────────────────────────────

function ask(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// ─────────────────────────────────────────────
// main
// ─────────────────────────────────────────────

async function main() {
  console.clear();

  log(`${c.cyan}${c.bold}`);
  log("   ███████╗████████╗ █████╗ ████████╗██╗ ██████╗");
  log("   ██╔════╝╚══██╔══╝██╔══██╗╚══██╔══╝██║██╔════╝");
  log("   ███████╗   ██║   ███████║   ██║   ██║██║");
  log("   ╚════██║   ██║   ██╔══██║   ██║   ██║██║");
  log("   ███████║   ██║   ██║  ██║   ██║   ██║╚██████╗");
  log("   ╚══════╝   ╚═╝   ╚═╝  ╚═╝   ╚═╝   ╚═╝ ╚═════╝");
  log(`${c.reset}`);
  log(`${c.dim}   static release builder${c.reset}\n`);

  // ───────────────────────────────────────────
  // read package.json
  // ───────────────────────────────────────────

  const pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"));

  log(`${c.bold}Current version:${c.reset} ${pkg.version}`);

  let version = await ask(`${c.cyan}New version: ${c.reset}`);

  // remove accidental "v"
  if (version.startsWith("v")) {
    version = version.slice(1);
  }

  // validate semver-ish version
  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
    fail(`Invalid version: ${version}`);
    process.exit(1);
  }

  log("");

  // ───────────────────────────────────────────
  // update package.json
  // ───────────────────────────────────────────

  info(`Updating package.json → ${c.bold}${version}${c.reset}`);

  pkg.version = version;

  fs.writeFileSync(
    packagePath,
    JSON.stringify(pkg, null, 2) + "\n"
    );

  success(`Version set to ${version}`);

  // ───────────────────────────────────────────
  // delete dist
  // ───────────────────────────────────────────

  log("");
  info("Cleaning previous build...");

  if (fs.existsSync(distPath)) {
    fs.rmSync(distPath, {
      recursive: true,
      force: true,
    });
  }

  success("dist/ deleted");

  // ───────────────────────────────────────────
  // create output folder BEFORE building
  // ───────────────────────────────────────────

  log("");
  info(`Creating output/${version}/`);

  const releaseOutput = path.join(outputPath, version);

  if (fs.existsSync(releaseOutput)) {
    fs.rmSync(releaseOutput, {
      recursive: true,
      force: true,
    });
  }

  fs.mkdirSync(releaseOutput, {
    recursive: true,
  });

  success(`Created output/${version}/`);

  // ───────────────────────────────────────────
  // build
  // ───────────────────────────────────────────

  log("");
  info("Building Static for macOS...");
  log(`${c.dim}This may take a while...${c.reset}\n`);

  progress("Preparing", 0);

  // small visual progress animation while electron-builder runs
  let fakeProgress = 0;

  const progressTimer = setInterval(() => {
    if (fakeProgress < 90) {
      fakeProgress += Math.random() * 3;

      if (fakeProgress > 90) {
        fakeProgress = 90;
      }

      progress("Building ", fakeProgress);
    }
  }, 250);

  try {
    const logFile = path.join(releaseOutput, "logs.txt");
    const logStream = fs.createWriteStream(logFile);

    await new Promise((resolve, reject) => {
      const child = spawn("npx", [
        "electron-builder",
        "--mac",
        "dmg",
        "--x64",
        "--arm64",
      ], {
        cwd: root,
        stdio: ["inherit", "pipe", "pipe"],
        shell: false,
      });

      child.stdout.pipe(logStream);
      child.stderr.pipe(logStream);

      child.on("error", reject);

      child.on("close", code => {
        logStream.end();

        if (code === 0) {
          resolve();
        } else {
          reject(
            new Error(`Command exited with code ${code}`)
            );
        }
      });
    });
  } catch (err) {
    clearInterval(progressTimer);

    process.stdout.write("\n");

    fail("Build failed.");
    console.error(err.message);

    process.exit(1);
  }

  clearInterval(progressTimer);

  progress("Building ", 100);
  log("\n");

  success("Electron build complete");

  // ───────────────────────────────────────────
  // find dmgs
  // ───────────────────────────────────────────

  const intelDmg = path.join(
    distPath,
  `Static-${version}.dmg`
  );

  const armDmg = path.join(
    distPath,
  `Static-${version}-arm64.dmg`
  );

  if (!fs.existsSync(intelDmg)) {
    fail(`Intel DMG not found: ${intelDmg}`);
    process.exit(1);
  }

  if (!fs.existsSync(armDmg)) {
    fail(`ARM64 DMG not found: ${armDmg}`);
    process.exit(1);
  }

  // ───────────────────────────────────────────
  // rename/copy dmgs
  // ───────────────────────────────────────────

  info("Packaging release files...");

  fs.copyFileSync(
    intelDmg,
    path.join(releaseOutput, "Static.x64.dmg")
    );

  success("Static.x64.dmg → Intel");

  fs.copyFileSync(
    armDmg,
    path.join(releaseOutput, "Static.arm64.dmg")
    );

  success("Static.arm64.dmg → Apple Silicon");

  // ───────────────────────────────────────────
  // blockmaps
  // ───────────────────────────────────────────

  const intelBlockmap = `${intelDmg}.blockmap`;
  const armBlockmap = `${armDmg}.blockmap`;

  if (fs.existsSync(intelBlockmap)) {
    fs.copyFileSync(
      intelBlockmap,
      path.join(
        releaseOutput,
        "Static.x64.dmg.blockmap"
        )
      );

    success("Static.x64.dmg.blockmap");
  }

  if (fs.existsSync(armBlockmap)) {
    fs.copyFileSync(
      armBlockmap,
      path.join(
        releaseOutput,
        "Static.arm64.dmg.blockmap"
        )
      );

    success("Static.arm64.dmg.blockmap");
  }

  // ───────────────────────────────────────────
  // done
  // ───────────────────────────────────────────

  log("");
  log(`${c.green}${c.bold}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}`);
  log(`${c.green}${c.bold}  BUILD COMPLETE!${c.reset}`);
  log(`${c.green}${c.bold}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}`);

  log("");
  log(`${c.bold}Version:${c.reset} ${version}`);
  log(`${c.bold}Output:${c.reset}  ./output/${version}/`);
  log("");

  log(`  ${c.blue}Intel${c.reset}`);
  log(`  └── Static.x64.dmg`);

  log("");
  log(`  ${c.green}Apple Silicon${c.reset}`);
  log(`  └── Static.arm64.dmg`);

  log("");
  log(`  ${c.dim}Logs${c.reset}`);
  log(`  └── logs.txt`);
  log("");

  exec(`open "${releaseOutput}"`);
}

// ─────────────────────────────────────────────
// start
// ─────────────────────────────────────────────

main().catch(err => {
  fail(err.message);
  process.exit(1);
});