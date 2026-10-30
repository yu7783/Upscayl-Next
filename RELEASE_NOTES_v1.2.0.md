# Upscayl-Next v1.2.0

A modern, animated installer and a much easier setup for the optional AI backend.

## Highlights

- **Redesigned Windows installer** — a dark, animated NSIS wizard with four
  custom pages instead of the previous single-banner welcome page:
  - **Welcome** — animated logo banner and GPU/Vulkan requirements.
  - **License & credits** — AGPL-3.0 notice, upstream credits and a required
    acceptance checkbox.
  - **Options** — optional HAT/DAT/SUPIR Python backend, installed
    automatically during setup when selected.
  - **Finish** — animated completion page with a launch checkbox.
- **One-click optional AI backend** — selecting the option runs
  `native/setup.ps1` during installation. If you skip it, a Start Menu shortcut
  named **Upscayl-Next - Set up AI backend** self-elevates and runs the same
  script later. The main app always works with the bundled NCNN models.
- **Modern theme** — dark palette, branded header/sidebar and consistent colors
  across the installer, generated from `build/icon.png`.
- **Copyright and credits** — the installer shows the AGPL-3.0 notice and lists
  Upscayl, upscayl-ncnn, Real-ESRGAN and model authors. The packaged app now
  includes `LICENSE`, `Real-ESRGAN_LICENSE.txt` and
  `THIRD_PARTY_NOTICES.txt` under `resources`.
- **Reproducible artwork** — `scripts/generate-installer-assets.ps1` generates
  every AVI and static BMP from the app icon. `predist:win` runs it before a
  Windows build, and intermediate BMP frames are deleted automatically.

## Installer flow

1. Welcome (animated)
2. License and credits (AGPL-3.0 acceptance)
3. Installation directory
4. Options (optional AI backend)
5. Installation progress
6. Finish (launch the app)

## Upgrading from v1.1.0

- Run the new `Upscayl-Next-Setup-1.2.0.exe` over the existing installation.
  The installer keeps your application data and custom models.
- If you already created `native/.venv`, the optional backend setup detects and
  reuses it.
- The old installer's `banner.avi` remains as a fallback for environments
  without FFmpeg; new pages use `welcome.avi`, `credits.avi`, `options.avi` and
  `finish.avi`.

## Notes

- The installer is **not code-signed**, so Windows SmartScreen may show a
  warning. Choose **More Info → Run Anyway** to continue.
- The optional AI backend needs Python 3.10 or 3.11, internet access and about
  2 GB of disk space.
- Video upscaling still requires FFmpeg on your PATH.
