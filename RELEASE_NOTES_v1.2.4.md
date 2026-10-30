# Upscayl-Next v1.2.4

Installer fix for the `ENOTDIR: not a directory` error.

## Fixes

- **Stale install path** — if the chosen install folder exists as a file (for
  example `%LOCALAPPDATA%\Programs\Upscayl-Next` left behind by an interrupted
  install), the installer now removes it and creates the folder correctly.
- **Clearer errors** — if an intermediate path component is a file, the
  installer reports which path is wrong and asks you to choose another folder
  instead of showing a bare `ENOTDIR` error.
- **Safer resource checks** — the installer now checks that the install path is
  a directory before looking for `Upscayl-Next.exe`.
- **File/directory conflicts** — the merge logic continues to replace stale
  file-vs-directory conflicts inside the install folder.

The application itself is unchanged from v1.2.3.

## Notes

- The installer is **not code-signed**, so Windows SmartScreen may show a
  warning. Choose **More Info → Run Anyway** to continue.
- The downloader needs an internet connection to fetch the latest package.
- The optional AI backend needs Python 3.10 or 3.11, internet access and about
  2 GB of disk space.
