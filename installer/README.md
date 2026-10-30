# Upscayl-Next Installer

A custom Electron downloader/installer that replaces the old NSIS wizard with a
modern animated UI.

## What it does

- Fetches the latest GitHub release for `yu7783/Upscayl-Next`.
- Downloads the portable ZIP package and verifies its SHA-256 checksum.
- Extracts the package into a user-writable folder
  (`%LOCALAPPDATA%\Programs\Upscayl-Next` by default).
- Creates desktop and Start Menu shortcuts.
- Registers an uninstaller in Windows Settings → Apps.
- Optionally installs the HAT/DAT/SUPIR Python backend (`native/setup.ps1`).
- Shows a dark, animated UI with download speed, ETA, progress ring and a
  completion animation.

The portable installer itself uses electron-builder's `portable` target with no
splash image, so the old-style extraction window stays hidden. The user only
sees this Electron UI.

## Build

Install the root dependencies first, then build the app package and the
installer:

```powershell
npm install
npm run dist:win          # produces dist/Upscayl-Next-Setup-<version>.zip
npm run installer-app     # produces installer/dist/Upscayl-Next-Installer-<version>.exe
```

`installer/package.json` is intentionally separate from the main app. It uses
the root `node_modules/electron/dist` distribution (`electronDist`) so no second
Electron download is required.

## Notes

- The installer is per-user by default and does not require administrator
  rights. The optional AI backend is installed into the user's install folder.
- The package is downloaded from the latest GitHub release. The release must
  include `Upscayl-Next-Setup-<version>.zip` and `SHA256SUMS.txt`.
- The installer is not code-signed, so Windows SmartScreen may warn.
- On a clean machine, `resources/native/.venv` is preserved during upgrades.
