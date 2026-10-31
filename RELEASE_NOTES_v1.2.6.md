# Upscayl-Next v1.2.6

Installer fix for `ENOTDIR` / `ENOTEMPTY` and “Could not extract the downloaded
package”.

## Root cause

Electron patches its `fs` module so that paths ending in `.asar` are treated as
ASAR archives. The installer was using that patched module to check and copy
`resources/app.asar`, which is a normal 125 MB file inside the downloaded
package. Electron therefore reported it as a directory, causing:

- `ENOTDIR: not a directory`
- `ENOTEMPTY: directory not empty`
- extraction tools being treated as failed even after they finished

## Fixes

- The installer now uses Electron's **`original-fs`** module for every
  filesystem operation. This bypasses the ASAR path handling, so
  `resources/app.asar` is correctly recognized as a file.
- Package extraction now uses `tar.exe` first (the Windows 10/11 system
  `bsdtar`), with PowerShell as a fallback.
- Extraction results are validated by checking both `Upscayl-Next.exe` and
  `resources/app.asar`. Validation retries briefly so antivirus scanning cannot
  cause a false failure.
- Temporary-folder cleanup is now best-effort with retries. A locked file can no
  longer turn a successful installation into an error.
- Installer diagnostics are written to
  `%TEMP%\upscayl-next-installer.log`.

The application itself is unchanged from v1.2.5.

## Verification

End-to-end test on Windows:

- downloaded the release package and verified SHA-256
- extracted with `tar.exe`
- installed `Upscayl-Next.exe`
- confirmed `app.asar` is a **file** of 125,334,747 bytes (not a folder)
- wrote `install.json`
- removed the temporary folder successfully

## Notes

- The installer is **not code-signed**, so Windows SmartScreen may show a
  warning. Choose **More Info → Run Anyway** to continue.
- The downloader needs an internet connection to fetch the latest package.
- The optional AI backend needs Python 3.10 or 3.11, internet access and about
  2 GB of disk space.
