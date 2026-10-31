/*
 * Upscayl-Next modern downloader / installer
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This is a separate Electron app packaged as a silent portable executable.
 * It downloads the latest portable ZIP from the official GitHub release,
 * verifies SHA-256, extracts it into a user-writable folder, creates
 * shortcuts, registers an uninstaller and optionally installs the native
 * AI backend. No third-party artwork or code is bundled here.
 */

const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path = require("path");
// Electron patches `fs` so that paths ending in `.asar` are treated as
// archives. The installer must handle resources/app.asar as a normal file,
// otherwise extraction and copying fail with ENOTDIR/ENOTEMPTY. `original-fs`
// is the unpatched Node.js filesystem module available in the main process.
const fs = require("original-fs");
const os = require("os");
const https = require("https");
const crypto = require("crypto");
const { spawn } = require("child_process");

const REPO = "yu7783/Upscayl-Next";
const RELEASE_API = `https://api.github.com/repos/${REPO}/releases/latest`;
const APP_EXE_NAME = "Upscayl-Next.exe";
const UNINSTALL_KEY = "Upscayl-Next";
const LOG_PATH = path.join(os.tmpdir(), "upscayl-next-installer.log");

let mainWindow = null;
let cachedRelease = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1060,
    height: 720,
    minWidth: 940,
    minHeight: 640,
    frame: false,
    show: false,
    backgroundColor: "#0b0a14",
    icon: path.join(__dirname, "assets", "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function send(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function sendProgress(phase, message, extra = {}) {
  send("installer:progress", { phase, message, ...extra });
}

function sendLog(line) {
  if (!line) return;
  const text = String(line);
  try {
    fs.appendFileSync(
      LOG_PATH,
      `[${new Date().toISOString()}] ${text}\n`,
      "utf8",
    );
  } catch {
    // Logging must never break the installer.
  }
  send("installer:log", text);
}

function httpsGetJson(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 6) {
      reject(new Error("Too many redirects while contacting GitHub."));
      return;
    }
    const request = https.get(
      url,
      {
        headers: {
          "User-Agent": "Upscayl-Next-Installer",
          Accept: "application/vnd.github+json",
        },
      },
      (response) => {
        if (
          response.statusCode >= 300 &&
          response.statusCode < 400 &&
          response.headers.location
        ) {
          response.resume();
          resolve(httpsGetJson(response.headers.location, redirects + 1));
          return;
        }
        if (response.statusCode !== 200) {
          response.resume();
          reject(
            new Error(
              `GitHub returned HTTP ${response.statusCode}. Check your connection or try again later.`,
            ),
          );
          return;
        }
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => {
          try {
            resolve(JSON.parse(body));
          } catch (error) {
            reject(new Error("GitHub returned an invalid response."));
          }
        });
      },
    );
    request.on("error", reject);
    request.setTimeout(30000, () => {
      request.destroy(new Error("Timed out while contacting GitHub."));
    });
  });
}

function downloadFile(url, destination, onProgress, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 6) {
      reject(new Error("Too many redirects while downloading the package."));
      return;
    }
    const request = https.get(
      url,
      { headers: { "User-Agent": "Upscayl-Next-Installer" } },
      (response) => {
        if (
          response.statusCode >= 300 &&
          response.statusCode < 400 &&
          response.headers.location
        ) {
          response.resume();
          resolve(
            downloadFile(
              response.headers.location,
              destination,
              onProgress,
              redirects + 1,
            ),
          );
          return;
        }
        if (response.statusCode !== 200) {
          response.resume();
          reject(new Error(`Download failed (HTTP ${response.statusCode}).`));
          return;
        }

        const total = Number(response.headers["content-length"] || 0);
        let received = 0;
        let lastReport = 0;
        const started = Date.now();
        const output = fs.createWriteStream(destination);

        response.on("data", (chunk) => {
          received += chunk.length;
          const now = Date.now();
          if (now - lastReport > 120) {
            lastReport = now;
            const elapsed = Math.max((now - started) / 1000, 0.1);
            const speed = received / elapsed;
            const eta =
              total > received && speed > 0 ? (total - received) / speed : 0;
            onProgress({
              received,
              total,
              speed,
              eta,
              percent: total > 0 ? Math.min(100, (received / total) * 100) : null,
            });
          }
        });

        response.pipe(output);
        output.on("finish", () => {
          output.close(() => {
            onProgress({ received, total, speed: 0, eta: 0, percent: 100 });
            resolve();
          });
        });
        output.on("error", reject);
      },
    );
    request.on("error", reject);
    request.setTimeout(60000, () => {
      request.destroy(new Error("The download timed out."));
    });
  });
}

function escapePowerShell(value) {
  return String(value).replace(/'/g, "''");
}

function formatFsError(error) {
  const parts = [];
  if (error && error.message) parts.push(error.message);
  if (error && error.path) parts.push(`path: ${error.path}`);
  if (error && error.dest) parts.push(`dest: ${error.dest}`);
  if (error && error.code === "ENOTDIR") {
    parts.push(
      "The installation path contains a file where a folder is required. Choose another folder.",
    );
  }
  return parts.join(" | ");
}

/**
 * Create a directory and tolerate a stale file at the final path (for example
 * `%LOCALAPPDATA%\Programs\Upscayl-Next` left as a file by an interrupted
 * install). If an intermediate path is a file we stop with a clear message
 * instead of Node's bare ENOTDIR.
 */
function ensureDirectory(directory) {
  const resolved = path.resolve(directory);
  const root = path.parse(resolved).root;
  const parts = resolved
    .slice(root.length)
    .split(path.sep)
    .filter((part) => part.length > 0);

  let current = root;
  for (let index = 0; index < parts.length; index += 1) {
    current = path.join(current, parts[index]);
    if (fs.existsSync(current)) {
      const stat = fs.lstatSync(current);
      if (stat.isDirectory()) continue;
      if (index === parts.length - 1) {
        removePathSync(current);
      } else {
        throw new Error(
          `The installation path contains a file where a folder is required: ${current}. Choose another folder.`,
        );
      }
    }
    fs.mkdirSync(current);
  }
}

function removePathSync(target) {
  if (!fs.existsSync(target)) return;
  const stat = fs.lstatSync(target);
  if (stat.isDirectory()) {
    fs.rmSync(target, {
      recursive: true,
      force: true,
      maxRetries: 12,
      retryDelay: 250,
    });
  } else {
    fs.rmSync(target, { force: true, maxRetries: 12, retryDelay: 250 });
  }
}

function removePathQuietly(target) {
  if (!target) return true;
  try {
    removePathSync(target);
    return true;
  } catch (error) {
    sendLog(`Cleanup warning: ${formatFsError(error)}`);
    return false;
  }
}

function runProcess(file, args, onLine, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, {
      cwd,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const handle = (data) => {
      const text = data.toString();
      for (const line of text.split(/\r?\n/)) {
        if (line.trim().length > 0) {
          if (onLine) onLine(line.trim());
        }
      }
    };
    child.stdout.on("data", (data) => {
      stdout += data.toString();
      handle(data);
    });
    child.stderr.on("data", (data) => {
      stderr += data.toString();
      handle(data);
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

async function getLatestRelease() {
  if (cachedRelease) return cachedRelease;

  sendProgress("metadata", "Checking the latest Upscayl-Next release...");
  const data = await httpsGetJson(RELEASE_API);
  const assets = Array.isArray(data.assets) ? data.assets : [];

  const zipAsset =
    assets.find(
      (asset) =>
        /\.zip$/i.test(asset.name) &&
        /(setup|portable|win)/i.test(asset.name),
    ) || assets.find((asset) => /\.zip$/i.test(asset.name));

  if (!zipAsset) {
    throw new Error(
      "The latest release does not contain a portable ZIP package. Open the release page and download it manually.",
    );
  }

  const checksumsAsset = assets.find((asset) =>
    /^sha256sums\.txt$/i.test(asset.name),
  );

  cachedRelease = {
    tag: data.tag_name,
    version: String(data.tag_name || "").replace(/^v/i, ""),
    name: data.name,
    publishedAt: data.published_at,
    htmlUrl: data.html_url,
    notes: data.body || "",
    zip: {
      name: zipAsset.name,
      url: zipAsset.browser_download_url,
      size: zipAsset.size,
    },
    checksums: checksumsAsset
      ? {
          name: checksumsAsset.name,
          url: checksumsAsset.browser_download_url,
        }
      : null,
  };
  return cachedRelease;
}

function findAppExecutable(installDir) {
  try {
    const installStat = fs.statSync(installDir);
    if (!installStat.isDirectory()) return null;
  } catch {
    return null;
  }

  const preferred = path.join(installDir, APP_EXE_NAME);
  if (fs.existsSync(preferred)) return preferred;

  try {
    const candidates = fs
      .readdirSync(installDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && /\.exe$/i.test(entry.name))
      .map((entry) => entry.name)
      .filter(
        (name) =>
          !/uninstall|elevate|crashpad|notification/i.test(name) &&
          !/^upscayl-bin/i.test(name),
      );
    if (candidates.length > 0) {
      return path.join(installDir, candidates[0]);
    }
  } catch {
    // Ignore and fall through.
  }
  return null;
}

async function verifySha256(filePath, checksumsPath, expectedName) {
  let checksums = "";
  try {
    checksums = fs.readFileSync(checksumsPath, "utf8");
  } catch {
    throw new Error("Could not read the downloaded SHA-256 checksums.");
  }

  const expected = checksums
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.toLowerCase().endsWith(expectedName.toLowerCase()))
    .map((line) => line.split(/\s+/)[0])
    .find((hash) => /^[a-f0-9]{64}$/i.test(hash));

  if (!expected) {
    throw new Error(
      `SHA-256 checksum for ${expectedName} was not found. The release may be incomplete.`,
    );
  }

  const hash = crypto.createHash("sha256");
  await new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  const actual = hash.digest("hex");
  if (actual.toLowerCase() !== expected.toLowerCase()) {
    throw new Error(
      "The downloaded package failed SHA-256 verification. Please try again.",
    );
  }
  sendLog(`SHA-256 verified: ${actual}`);
}

function validateExtractedPackage(destination) {
  const asarPath = path.join(destination, "resources", "app.asar");
  if (fs.existsSync(asarPath)) {
    const stat = fs.lstatSync(asarPath);
    if (stat.isDirectory()) {
      throw new Error(
        "The package was extracted incorrectly: resources/app.asar became a folder.",
      );
    }
  }

  const exePath = path.join(destination, APP_EXE_NAME);
  if (!fs.existsSync(exePath) || !fs.lstatSync(exePath).isFile()) {
    throw new Error(
      "The package was extracted incorrectly: Upscayl-Next.exe is missing.",
    );
  }
  if (!fs.existsSync(asarPath) || !fs.lstatSync(asarPath).isFile()) {
    throw new Error(
      "The package was extracted incorrectly: resources/app.asar is missing.",
    );
  }
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForValidPackage(destination, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  const startedAt = Date.now();
  let lastError = null;
  let nextNotice = 5000;
  while (Date.now() < deadline) {
    try {
      validateExtractedPackage(destination);
      return { ok: true, error: null };
    } catch (error) {
      lastError = error;
      const elapsed = Date.now() - startedAt;
      if (elapsed >= nextNotice) {
        sendLog(
          "Waiting for the extracted files to finish writing (antivirus can delay this)...",
        );
        nextNotice += 5000;
      }
      await delay(400);
    }
  }
  return { ok: false, error: lastError };
}

function resolveTarExecutable() {
  const systemRoot = process.env.SystemRoot || "C:\\Windows";
  const systemTar = path.join(systemRoot, "System32", "tar.exe");
  return fs.existsSync(systemTar) ? systemTar : "tar.exe";
}

async function extractZip(zipPath, destination) {
  // Each attempt uses its own directory. If the built-in extractor fails
  // halfway through, files can stay locked by antivirus or by the extractor
  // itself. Retrying in a fresh directory avoids ENOTEMPTY/EBUSY errors when
  // cleaning up the partial folder.
  const attempts = [
    {
      name: "tar.exe",
      dir: `${destination}-tar`,
      timeout: 60000,
      run: async (dir) => {
        const result = await runProcess(
          resolveTarExecutable(),
          ["-xf", zipPath, "-C", dir],
          (line) => sendLog(line),
        );
        if (result.code !== 0) {
          throw new Error(`tar.exe exited with code ${result.code}.`);
        }
      },
    },
    {
      name: "PowerShell",
      dir: `${destination}-ps`,
      timeout: 60000,
      run: async (dir) => {
        const command =
          "$ErrorActionPreference = 'Stop'; " +
          `Expand-Archive -LiteralPath '${escapePowerShell(zipPath)}' ` +
          `-DestinationPath '${escapePowerShell(dir)}' -Force`;
        const result = await runProcess(
          "powershell.exe",
          ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command],
          (line) => sendLog(line),
        );
        if (result.code !== 0) {
          throw new Error(`PowerShell exited with code ${result.code}.`);
        }
      },
    },
  ];

  let lastError = null;
  for (const attempt of attempts) {
    let runError = null;
    try {
      sendLog(`Extracting the package with ${attempt.name}...`);
      ensureDirectory(attempt.dir);
      await attempt.run(attempt.dir);
    } catch (error) {
      runError = error;
      sendLog(`${attempt.name} reported: ${formatFsError(error)}`);
    }

    // Extraction tools can return before all files are finalized, and
    // antivirus can briefly expose an intermediate directory. Poll for a
    // short while so a complete package is not discarded too early.
    const validation = await waitForValidPackage(
      attempt.dir,
      attempt.timeout || 15000,
    );
    if (validation.ok) {
      if (runError) {
        sendLog(
          `${attempt.name} reported an error, but the extracted package is complete. Continuing.`,
        );
      }
      return attempt.dir;
    }

    lastError = validation.error;
    sendLog(
      `${attempt.name} did not produce a usable package: ${formatFsError(
        validation.error,
      )}`,
    );
    // Leave the partial folder alone. It is inside the temporary directory
    // and will be removed best-effort after the installation finishes.
  }

  throw new Error(
    `Could not extract the downloaded package. ${
      lastError ? formatFsError(lastError) : ""
    } Make sure no antivirus is blocking the temporary folder.`.trim(),
  );
}

/**
 * Merge the staged package into the install folder while tolerating stale
 * file/directory type conflicts. This can happen if a previous installation
 * was interrupted or an older package used a different layout. Extra files
 * that only exist in the destination (for example resources/native/.venv) are
 * preserved.
 */
function copyTree(source, destination) {
  const sourceStat = fs.lstatSync(source);
  if (sourceStat.isDirectory()) {
    if (fs.existsSync(destination)) {
      const destinationStat = fs.lstatSync(destination);
      if (!destinationStat.isDirectory()) {
        removePathSync(destination);
      }
    }
    fs.mkdirSync(destination, { recursive: true });
    for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
      copyTree(
        path.join(source, entry.name),
        path.join(destination, entry.name),
      );
    }
    return;
  }

  fs.mkdirSync(path.dirname(destination), { recursive: true });
  if (fs.existsSync(destination)) {
    const destinationStat = fs.lstatSync(destination);
    if (destinationStat.isDirectory()) {
      removePathSync(destination);
    }
  }
  fs.copyFileSync(source, destination);
}


function writePowerShellScript(file, content) {
  ensureDirectory(path.dirname(file));
  // Windows PowerShell 5.1 needs the BOM to treat the file as UTF-8.
  fs.writeFileSync(file, "\uFEFF" + content, "utf8");
}

async function createShortcuts(installDir, options, tempDir) {
  const appExe = findAppExecutable(installDir);
  if (!appExe) {
    throw new Error("The installed package does not contain the application executable.");
  }

  const lines = [
    "$ErrorActionPreference = 'Stop'",
    "$ws = New-Object -ComObject WScript.Shell",
    `$target = '${escapePowerShell(appExe)}'`,
    `$work = '${escapePowerShell(installDir)}'`,
    "$icon = \"$target,0\"",
    "function New-Shortcut($path) {",
    "  $sc = $ws.CreateShortcut($path)",
    "  $sc.TargetPath = $target",
    "  $sc.WorkingDirectory = $work",
    "  $sc.IconLocation = $icon",
    "  $sc.Description = 'Upscayl-Next'",
    "  $sc.Save()",
    "}",
  ];
  if (options.desktopShortcut) {
    lines.push(
      "New-Shortcut (Join-Path ([Environment]::GetFolderPath('Desktop')) 'Upscayl-Next.lnk')",
    );
  }
  if (options.startMenuShortcut) {
    lines.push(
      "$startPrograms = Join-Path ([Environment]::GetFolderPath('StartMenu')) 'Programs'",
      "New-Shortcut (Join-Path $startPrograms 'Upscayl-Next.lnk')",
    );
  }

  if (!options.desktopShortcut && !options.startMenuShortcut) return;
  const scriptPath = path.join(tempDir, "create-shortcuts.ps1");
  writePowerShellScript(scriptPath, lines.join("\r\n"));
  sendProgress("shortcuts", "Creating shortcuts...");
  const result = await runProcess(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath],
    (line) => sendLog(line),
  );
  if (result.code !== 0) {
    throw new Error("Could not create the desktop or Start Menu shortcut.");
  }
}

function buildUninstallerScript(installDir) {
  const escapedDir = escapePowerShell(installDir);
  return [
    "$ErrorActionPreference = 'SilentlyContinue'",
    `$installDir = '${escapedDir}'`,
    "$desktop = [Environment]::GetFolderPath('Desktop')",
    "$startMenu = [Environment]::GetFolderPath('StartMenu')",
    "Remove-Item -LiteralPath (Join-Path $desktop 'Upscayl-Next.lnk') -Force",
    "Remove-Item -LiteralPath (Join-Path (Join-Path $startMenu 'Programs') 'Upscayl-Next.lnk') -Force",
    `Remove-Item -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${UNINSTALL_KEY}' -Recurse -Force`,
    "$tempScript = Join-Path $env:TEMP 'upscayl-next-remove.ps1'",
    "$removeLines = @(",
    "  'Start-Sleep -Seconds 2',",
    `  "Remove-Item -LiteralPath '$installDir' -Recurse -Force -ErrorAction SilentlyContinue",`,
    '  "Remove-Item -LiteralPath $tempScript -Force -ErrorAction SilentlyContinue"',
    ")",
    '$removeLines -join "`r`n" | Set-Content -LiteralPath $tempScript -Encoding UTF8',
    "Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File', $tempScript) -WindowStyle Hidden",
  ].join("\r\n");
}


async function writeUninstaller(installDir, version, tempDir) {
  const uninstallPath = path.join(installDir, "uninstall.ps1");
  fs.writeFileSync(
    uninstallPath,
    "\uFEFF" + buildUninstallerScript(installDir),
    "utf8",
  );

  const appExe = findAppExecutable(installDir);
  if (!appExe) {
    throw new Error("The installed package does not contain the application executable.");
  }

  const registryLines = [
    "$ErrorActionPreference = 'Stop'",
    `$key = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${UNINSTALL_KEY}'`,
    "New-Item -Path $key -Force | Out-Null",
    `New-ItemProperty -Path $key -Name 'DisplayName' -Value 'Upscayl-Next ${escapePowerShell(version)}' -PropertyType String -Force | Out-Null`,
    `New-ItemProperty -Path $key -Name 'DisplayVersion' -Value '${escapePowerShell(version)}' -PropertyType String -Force | Out-Null`,
    "New-ItemProperty -Path $key -Name 'Publisher' -Value 'Upscayl-Next contributors' -PropertyType String -Force | Out-Null",
    `New-ItemProperty -Path $key -Name 'InstallLocation' -Value '${escapePowerShell(installDir)}' -PropertyType String -Force | Out-Null`,
    `New-ItemProperty -Path $key -Name 'DisplayIcon' -Value '${escapePowerShell(appExe)},0' -PropertyType String -Force | Out-Null`,
    `New-ItemProperty -Path $key -Name 'UninstallString' -Value 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${escapePowerShell(uninstallPath)}"' -PropertyType String -Force | Out-Null`,
    "New-ItemProperty -Path $key -Name 'NoModify' -Value 1 -PropertyType DWord -Force | Out-Null",
    "New-ItemProperty -Path $key -Name 'NoRepair' -Value 1 -PropertyType DWord -Force | Out-Null",
  ];
  const scriptPath = path.join(tempDir, "register-uninstall.ps1");
  writePowerShellScript(scriptPath, registryLines.join("\r\n"));
  sendProgress("uninstaller", "Registering the uninstaller...");
  const result = await runProcess(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath],
    (line) => sendLog(line),
  );
  if (result.code !== 0) {
    sendLog("Warning: the uninstaller registry entry could not be created.");
  }
}

async function installBackend(installDir) {
  const setupPath = path.join(
    installDir,
    "resources",
    "native",
    "setup.ps1",
  );
  if (!fs.existsSync(setupPath)) {
    sendLog("The optional AI backend setup script was not found in the package.");
    return {
      ok: false,
      message: "The optional AI backend files are missing from this package.",
    };
  }

  sendProgress(
    "backend",
    "Installing the optional AI backend. This can take several minutes...",
  );
  const result = await runProcess(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", setupPath],
    (line) => sendLog(line),
    path.dirname(setupPath),
  );
  if (result.code !== 0) {
    return {
      ok: false,
      message:
        "The optional AI backend could not be installed. Python 3.10 or 3.11 is required. You can retry later from the Start Menu shortcut.",
    };
  }
  return { ok: true, message: "The optional AI backend was installed." };
}


function validateInstallDir(directory) {
  if (!directory || !path.isAbsolute(directory)) {
    throw new Error("Please choose a valid installation folder.");
  }
  const resolved = path.resolve(directory);
  const root = path.parse(resolved).root;
  if (path.normalize(resolved).toLowerCase() === root.toLowerCase()) {
    throw new Error("The drive root cannot be used as the installation folder.");
  }
  const forbidden = [
    "c:\\windows",
    "c:\\windows\\system32",
    "c:\\program files",
    "c:\\program files (x86)",
  ];
  if (forbidden.includes(path.normalize(resolved).toLowerCase())) {
    throw new Error(
      "Please choose a folder inside your user profile, for example LocalAppData\\Programs\\Upscayl-Next.",
    );
  }
  return resolved;
}

async function installApp(options) {
  const installDir = validateInstallDir(options.installDir);
  if (!options.acceptLicense) {
    const message =
      "Please accept the AGPL-3.0 license and the credits before installing.";
    send("installer:done", { success: false, error: message });
    return { success: false, error: message };
  }

  let tempDir = null;
  try {
    const release = await getLatestRelease();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "upscayl-next-"));

    sendProgress("download", `Downloading Upscayl-Next ${release.version}...`, {
      percent: 0,
      total: release.zip.size,
    });
    const zipPath = path.join(tempDir, release.zip.name);
    await downloadFile(release.zip.url, zipPath, (progress) => {
      sendProgress(
        "download",
        `Downloading ${release.zip.name}...`,
        progress,
      );
    });

    if (release.checksums) {
      sendProgress("verify", "Verifying the download...");
      const checksumsPath = path.join(tempDir, "SHA256SUMS.txt");
      await downloadFile(release.checksums.url, checksumsPath, () => {});
      await verifySha256(zipPath, checksumsPath, release.zip.name);
    } else {
      sendLog("Warning: the release has no SHA-256 checksums; verification was skipped.");
    }

    sendProgress("extract", "Extracting the application files...");
    const staging = await extractZip(zipPath, path.join(tempDir, "app"));

    sendProgress("copy", "Installing Upscayl-Next...");
    ensureDirectory(installDir);
    copyTree(staging, installDir);
    sendLog(`Installed application files to ${installDir}`);

    await createShortcuts(installDir, options, tempDir);
    await writeUninstaller(installDir, release.version, tempDir);

    let backend = null;
    if (options.installBackend) {
      backend = await installBackend(installDir);
    }

    const manifest = {
      version: release.version,
      installedAt: new Date().toISOString(),
      backendInstalled: backend ? backend.ok : false,
      source: release.htmlUrl,
    };
    fs.writeFileSync(
      path.join(installDir, "install.json"),
      JSON.stringify(manifest, null, 2),
      "utf8",
    );

    sendProgress("done", "Installation complete.", { percent: 100 });
    send("installer:done", {
      success: true,
      installDir,
      version: release.version,
      backend,
    });
    return { success: true, installDir, version: release.version, backend };
  } catch (error) {
    const message = formatFsError(error);
    send("installer:done", { success: false, error: message });
    return { success: false, error: message };
  } finally {
    if (tempDir) {
      // Never let a locked temporary file mask a successful installation.
      removePathQuietly(tempDir);
    }
  }
}


ipcMain.handle("installer:getDefaults", () => {
  const localAppData =
    process.env.LOCALAPPDATA ||
    path.join(os.homedir(), "AppData", "Local");
  return {
    defaultInstallDir: path.join(localAppData, "Programs", "Upscayl-Next"),
    installerVersion: app.getVersion(),
    repo: REPO,
    platform: process.platform,
  };
});

ipcMain.handle("installer:getLatestRelease", async () => {
  try {
    return { success: true, release: await getLatestRelease() };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
});

ipcMain.handle("installer:selectFolder", async (_event, currentPath) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Choose where to install Upscayl-Next",
    defaultPath: currentPath || undefined,
    properties: ["openDirectory", "createDirectory"],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

ipcMain.handle("installer:startInstall", async (_event, options) => {
  const safeOptions = {
    installDir:
      options && typeof options.installDir === "string"
        ? options.installDir
        : "",
    desktopShortcut: Boolean(options && options.desktopShortcut),
    startMenuShortcut: Boolean(options && options.startMenuShortcut),
    installBackend: Boolean(options && options.installBackend),
    acceptLicense: Boolean(options && options.acceptLicense),
  };
  return installApp(safeOptions);
});

ipcMain.handle("installer:launchApp", async (_event, installDir) => {
  const appExe = findAppExecutable(installDir);
  if (!appExe) {
    return { success: false, error: "Upscayl-Next.exe was not found." };
  }
  const error = await shell.openPath(appExe);
  return error ? { success: false, error } : { success: true };
});

ipcMain.handle("installer:openFolder", async (_event, directory) => {
  const error = await shell.openPath(directory);
  return error ? { success: false, error } : { success: true };
});

ipcMain.handle("installer:openUrl", async (_event, url) => {
  if (typeof url !== "string" || !/^https:\/\//i.test(url)) {
    return { success: false, error: "Only HTTPS links are allowed." };
  }
  await shell.openExternal(url);
  return { success: true };
});

ipcMain.on("window:minimize", () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on("window:close", () => {
  if (mainWindow) mainWindow.close();
});

app.setAppUserModelId("org.upscaylnext.Installer");

app.on("web-contents-created", (_event, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//i.test(url)) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });
});

function cleanupStaleTempDirs() {
  const tempRoot = os.tmpdir();
  let entries = [];
  try {
    entries = fs.readdirSync(tempRoot, { withFileTypes: true });
  } catch {
    return;
  }
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith("upscayl-next-")) {
      continue;
    }
    const fullPath = path.join(tempRoot, entry.name);
    try {
      const stat = fs.statSync(fullPath);
      if (stat.mtimeMs < cutoff) {
        removePathQuietly(fullPath);
      }
    } catch {
      // Ignore stale temp folders that disappear or are locked.
    }
  }
}

app.whenReady().then(() => {
  sendLog(
    `Upscayl-Next Installer ${app.getVersion()} starting (${process.platform}).`,
  );
  cleanupStaleTempDirs();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  app.quit();
});

