# Upscayl-Next v1.2.5

Installer fix for **“Could not extract the downloaded package”**.

## Fixes

- The installer now uses a bundled Node ZIP extractor as its primary
  extraction method. It no longer depends on `tar.exe` or Windows PowerShell
  being available or working correctly.
- This also avoids the Windows PowerShell 5.1 `Expand-Archive` bug that could
  turn `resources/app.asar` into a folder and cause `ENOTDIR` errors.
- `tar.exe` and PowerShell remain as fallbacks, and a failed extraction is
  cleaned up before retrying.
- The downloaded package is still verified with SHA-256 before extraction.

The application itself is unchanged from v1.2.4.

## Notes

- The installer is **not code-signed**, so Windows SmartScreen may show a
  warning. Choose **More Info → Run Anyway** to continue.
- The downloader needs an internet connection to fetch the latest package.
- The optional AI backend needs Python 3.10 or 3.11, internet access and about
  2 GB of disk space.
