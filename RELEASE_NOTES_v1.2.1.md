# Upscayl-Next v1.2.1

A patch release that fixes the installer display problems reported in v1.2.0.

## Fixes

- **Installer layout** — custom pages now use NSIS dialog units (`u`) instead
  of raw pixels, so controls fill the page correctly and no longer appear tiny
  or clipped.
- **Readable controls** — removed the parent-window color overrides that made
  buttons, checkboxes and the directory page difficult to read.
- **Animations actually play** — the installer AVIs are now encoded with
  Microsoft RLE (`msrle`/8-bit) instead of ffmpeg's rawvideo stream, which the
  Windows `SysAnimate32` control showed as a blank white area. The welcome,
  credits, options and finish pages now display their animations.
- **Text wrapping** — shortened the long credit/options lines and adjusted
  vertical positions so nothing overlaps or is cut off.
- **Cleaner palette** — corrected the MUI header colors to the intended BGR
  values and kept the dark header with readable white text.

## Installer flow

1. Welcome (animated)
2. License and credits (AGPL-3.0 acceptance)
3. Installation directory
4. Options (optional AI backend)
5. Installation progress
6. Finish (launch the app)

## Notes

- The installer is **not code-signed**, so Windows SmartScreen may show a
  warning. Choose **More Info → Run Anyway** to continue.
- The optional AI backend still needs Python 3.10 or 3.11, internet access and
  about 2 GB of disk space.
- The main application is unchanged from v1.2.0; this release only fixes the
  installer.
