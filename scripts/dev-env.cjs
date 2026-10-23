"use strict";
// Shared environment probes for scripts/dev-bootstrap.sh, .devcontainer/doctor.sh
// and playwright.config.ts. CommonJS so the Playwright config loader can require
// it on every supported Node release without ESM interop.
//
//   node scripts/dev-env.cjs chromium      -> "bundled <path>" | "fallback <source> <path>" | "missing"
//   node scripts/dev-env.cjs node-modules  -> exit 0 when node_modules matches package-lock.json

const fs = require("node:fs");
const path = require("node:path");

const PREINSTALLED_CHROMIUM = "/opt/pw-browsers/chromium";

function isExecutableFile(file) {
  try {
    fs.accessSync(file, fs.constants.X_OK);
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

// Playwright writes INSTALLATION_COMPLETE only after a browser finishes
// installing. A directory without it, or without the executable inside one of
// its platform subdirectories, is an interrupted download or partial restore.
const HEADLESS_SHELL_NAMES = [
  "chrome-headless-shell",
  "chrome-headless-shell.exe",
  "headless_shell",
  "headless_shell.exe",
];

function hasInstalledBrowser(dir, executableNames) {
  if (!fs.existsSync(path.join(dir, "INSTALLATION_COMPLETE"))) return false;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return false;
  }
  return entries.some(
    (entry) =>
      entry.isDirectory() &&
      executableNames.some((name) => isExecutableFile(path.join(dir, entry.name, name))),
  );
}

function bundledChromium(root = process.cwd()) {
  let executable;
  try {
    const playwright = require(require.resolve("playwright-core", { paths: [root] }));
    executable = playwright.chromium.executablePath();
  } catch {
    return {
      ready: false,
      executable: null,
      headlessShell: null,
      reason: "playwright-core is not installed",
    };
  }
  // Headless runs use the chromium_headless_shell-<revision> sibling of the
  // chromium-<revision> directory. Both come from `playwright install chromium`.
  const match = /^(.*)[\\/]chromium-(\d+)[\\/]/.exec(executable);
  const headlessShell = match ? path.join(match[1], `chromium_headless_shell-${match[2]}`) : null;
  const ready =
    isExecutableFile(executable) &&
    (!headlessShell || hasInstalledBrowser(headlessShell, HEADLESS_SHELL_NAMES));
  return {
    ready,
    executable,
    headlessShell,
    reason: ready ? null : `${executable} is not installed`,
  };
}

// Returns the Chromium executable Playwright should use. `executablePath` is
// undefined when the browser bundled with the installed Playwright version is
// present, so Windows, CI and Dev Container behaviour stays unchanged.
function resolveChromium({ env = process.env, root = process.cwd() } = {}) {
  const bundled = bundledChromium(root);
  if (bundled.ready) return { source: "bundled", executablePath: undefined, bundled };

  const candidates = [];
  if (env.PLAYWRIGHT_CHROMIUM_EXECUTABLE) {
    candidates.push({
      source: "PLAYWRIGHT_CHROMIUM_EXECUTABLE",
      file: env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
    });
  }
  if (env.PLAYWRIGHT_BROWSERS_PATH && env.PLAYWRIGHT_BROWSERS_PATH !== "0") {
    candidates.push({
      source: "PLAYWRIGHT_BROWSERS_PATH",
      file: path.join(env.PLAYWRIGHT_BROWSERS_PATH, "chromium"),
    });
  }
  candidates.push({ source: "preinstalled", file: PREINSTALLED_CHROMIUM });

  for (const candidate of candidates) {
    if (isExecutableFile(candidate.file)) {
      return { source: candidate.source, executablePath: candidate.file, bundled };
    }
  }
  return { source: "missing", executablePath: undefined, bundled };
}

// npm records what it installed in node_modules/.package-lock.json. The
// install matches the canonical lockfile when every installed package has the
// locked version and integrity, and every non-optional locked package exists.
function nodeModulesInSync(root = process.cwd()) {
  const read = (file) => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
  let locked;
  let installed;
  try {
    locked = read("package-lock.json").packages ?? {};
  } catch (error) {
    return { inSync: false, reason: `package-lock.json is unreadable: ${error.message}` };
  }
  try {
    installed = read("node_modules/.package-lock.json").packages ?? {};
  } catch {
    return {
      inSync: false,
      reason: "node_modules/.package-lock.json is missing (npm ci has not completed)",
    };
  }
  for (const [name, entry] of Object.entries(installed)) {
    const expected = locked[name];
    if (!expected)
      return { inSync: false, reason: `${name} is installed but not in package-lock.json` };
    if (
      expected.version !== entry.version ||
      (expected.integrity && expected.integrity !== entry.integrity)
    ) {
      return {
        inSync: false,
        reason: `${name} ${entry.version} differs from locked ${expected.version}`,
      };
    }
  }
  for (const [name, entry] of Object.entries(locked)) {
    if (name === "" || entry.optional || entry.link) continue;
    if (!installed[name]) return { inSync: false, reason: `${name} is locked but not installed` };
    // The hidden lockfile can outlive a package directory removed by an
    // interrupted operation on a cached volume; confirm the package is on disk.
    if (name.startsWith("node_modules/") && !fs.existsSync(path.join(root, name, "package.json"))) {
      return { inSync: false, reason: `${name} is recorded but missing on disk` };
    }
  }
  return { inSync: true, reason: null };
}

module.exports = {
  PREINSTALLED_CHROMIUM,
  bundledChromium,
  hasInstalledBrowser,
  nodeModulesInSync,
  resolveChromium,
};

if (require.main === module) {
  const command = process.argv[2];
  if (command === "chromium") {
    const result = resolveChromium();
    if (result.source === "bundled") console.log(`bundled ${result.bundled.executable}`);
    else if (result.executablePath)
      console.log(`fallback ${result.source} ${result.executablePath}`);
    else console.log("missing");
    process.exit(result.source === "missing" ? 1 : 0);
  } else if (command === "node-modules") {
    const result = nodeModulesInSync();
    if (!result.inSync) console.log(result.reason);
    process.exit(result.inSync ? 0 : 1);
  } else {
    console.error("Usage: node scripts/dev-env.cjs {chromium|node-modules}");
    process.exit(2);
  }
}
