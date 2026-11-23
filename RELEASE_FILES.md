# Upscayl-Next v1.3.1 Release Manifest

This file lists every artifact and source file required for the GitHub `v1.3.1`
release. App artifacts are generated into `dist/`; the custom installer is
generated into `installer/dist/`.

## GitHub Release assets

| File | Purpose |
| --- | --- |
| `Upscayl-Next-Installer-1.3.1.exe` | Custom modern Electron downloader (recommended) |
| `Upscayl-Next-Setup-1.3.1.exe` | Legacy NSIS installer / auto-update fallback |
| `Upscayl-Next-Setup-1.3.1.exe.blockmap` | Electron auto-update block map |
| `Upscayl-Next-Setup-1.3.1.zip` | Portable ZIP package downloaded by the custom installer |
| `latest.yml` | electron-updater feed metadata |
| `SHA256SUMS.txt` | Checksums for the assets above |

## Source files required to reproduce the build

### Root configuration
- `package.json`
- `package-lock.json`
- `tsconfig.json`
- `next.config.js`
- `postcss.config.js`
- `tailwind.config.js`
- `components.json`
- `notarize.js`

### Electron main process
- `electron/index.ts`
- `electron/main-window.ts`
- `electron/preload.ts`
- `electron/commands/batch-upscayl.ts`
- `electron/commands/double-upscayl.ts`
- `electron/commands/image-upscayl.ts`
- `electron/commands/multi-model-upscayl.ts`
- `electron/commands/video-upscayl.ts`
- `electron/commands/video-info.ts`
- `electron/commands/stop.ts`
- `electron/commands/select-file.ts`
- `electron/commands/select-folder.ts`
- `electron/commands/select-video.ts`
- `electron/commands/paste-image.ts`
- `electron/commands/open-folder.ts`
- `electron/commands/get-models-list.ts`
- `electron/commands/custom-models-select.ts`
- `electron/commands/auto-update.ts`
- `electron/types/`
- `electron/utils/`

### Shared logic
- `common/`
- `tests/`

### Native HAT/DAT/SUPIR backend
- `native/upscayl_native/`
- `native/requirements.txt`
- `native/setup.ps1`
- `native/setup-launcher.ps1`
- `native/setup.sh`
- `native/make_test_checkpoint.py`
- `native/README.md`

### Renderer (Next.js UI)
- `renderer/`

### Installer assets and scripts
- `build/icon.png`
- `build/installer.nsh`
- `build/THIRD_PARTY_NOTICES.txt`
- `build/anim/welcome.avi`
- `build/anim/credits.avi`
- `build/anim/options.avi`
- `build/anim/finish.avi`
- `build/anim/banner.avi` (legacy fallback)
- `build/anim/installerHeader.bmp`
- `build/anim/installerSidebar.bmp`
- `scripts/generate-installer-assets.ps1`
- `scripts/validate-schema.js`
- `scripts/generate-schema.js`

### Custom modern downloader (installer/)
- `installer/package.json`
- `installer/package-lock.json`
- `installer/main.js`
- `installer/preload.js`
- `installer/renderer/index.html`
- `installer/renderer/styles.css`
- `installer/renderer/app.js`
- `installer/assets/icon.png`
- `installer/README.md`

### Runtime binaries and models
- `resources/win/bin/upscayl-bin.exe`
- `resources/win/bin/vcomp140.dll`
- `resources/win/bin/vcomp140d.dll`
- `models/`
- `resources/icons/`

### Documentation and licenses
- `README.md`
- `LICENSE`
- `Real-ESRGAN_LICENSE.txt`
- `COMPARISONS.MD`
- `RELEASE_FILES.md`
- `RELEASE_NOTES_v1.0.0.md`
- `RELEASE_NOTES_v1.1.0.md`
- `RELEASE_NOTES_v1.2.0.md`
- `RELEASE_NOTES_v1.2.1.md`
- `RELEASE_NOTES_v1.2.2.md`
- `RELEASE_NOTES_v1.2.3.md`
- `RELEASE_NOTES_v1.2.4.md`
- `RELEASE_NOTES_v1.2.5.md`
- `RELEASE_NOTES_v1.2.6.md`
- `RELEASE_NOTES_v1.3.0.md`
- `RELEASE_NOTES_v1.3.1.md`

## Build and verification

```powershell
# 1. Run tests
npm test

# 2. Build the app package and legacy NSIS installer
npm run dist:win

# 3. Build the custom modern downloader
npm run installer-app

# 4. Verify checksums
Get-Content dist/SHA256SUMS.txt
Get-FileHash dist/Upscayl-Next-Setup-1.3.1.exe -Algorithm SHA256
Get-FileHash installer/dist/Upscayl-Next-Installer-1.3.1.exe -Algorithm SHA256
```

## Release checklist

- [x] Version set to `1.3.1` in `package.json`, `package-lock.json`, `installer/package.json`, and `installer/package-lock.json`
- [x] Video upscaling pipeline accelerated (GPU HW encoding, fast JPEG intermediate, hwaccel decode, double-buffered async chunks, lossless frame deduplication, GPU-optimal thread split)
- [x] Unit test suite (`npm test`) and Next.js production build (`npm run build`) verified
- [x] `README.md` and `RELEASE_NOTES_v1.3.1.md` updated
- [x] GitHub Release `v1.3.1` published with Windows assets
  (https://github.com/yu7783/Upscayl-Next/releases/tag/v1.3.1)
