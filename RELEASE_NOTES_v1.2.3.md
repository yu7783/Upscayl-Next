# Upscayl-Next v1.2.3

A completely custom, modern downloader replaces the old-style installer wizard.

## Highlights

- **Custom Electron installer/downloader** — the recommended download is now
  `Upscayl-Next-Installer-1.2.3.exe`, a frameless dark app instead of the NSIS
  wizard.
- **Animated modern UI** — floating gradient orbs, a five-step progress rail,
  animated download ring with percentage, speed and ETA, live install log and a
  confetti/completion animation.
- **Simple flow** — Welcome → Settings → Download → Install → Finish. The
  downloader finds the latest GitHub release automatically.
- **SHA-256 verification** — the portable ZIP is checked against the release's
  `SHA256SUMS.txt` before extraction.
- **Per-user install** — defaults to
  `%LOCALAPPDATA%\Programs\Upscayl-Next`, so no administrator prompt is needed.
- **Shortcuts and uninstaller** — desktop/Start Menu shortcuts and a Windows
  Settings → Apps uninstall entry are created automatically.
- **Optional AI backend** — HAT/DAT/SUPIR support can be installed during setup
  or later from the generated Start Menu shortcut.
- **Upgrade-safe copying** — existing installations are merged safely and
  `resources/native/.venv` is preserved.

## Legacy installer

The NSIS installer (`Upscayl-Next-Setup-1.2.3.exe`) and portable ZIP are still
published for auto-update and as a fallback. New users should use the custom
downloader.

## Build

```powershell
npm run dist:win        # app package + legacy NSIS installer
npm run installer-app   # custom modern downloader
```

The custom installer source lives in `installer/`.

## Notes

- The installer is **not code-signed**, so Windows SmartScreen may show a
  warning. Choose **More Info → Run Anyway** to continue.
- The downloader needs an internet connection to fetch the latest package.
- The optional AI backend needs Python 3.10 or 3.11, internet access and about
  2 GB of disk space.
