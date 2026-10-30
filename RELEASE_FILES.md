# Upscayl-Next v1.2.3 Release Manifest

This file lists every artifact and source file required for the GitHub `v1.2.3`
release. App artifacts are generated into `dist/`; the custom installer is
generated into `installer/dist/`.

## GitHub Release assets (upload these)

| File | Size (bytes) | SHA-256 | Purpose |
| --- | ---: | --- | --- |
| `Upscayl-Next-Installer-1.2.3.exe` | 74,358,840 | `d6eab2c535d15fbe9c89c333c17091d08c0156627fb5cb09194752418ea9c60e` | Custom modern Electron downloader (recommended) |
| `Upscayl-Next-Setup-1.2.3.exe` | 269,521,139 | `3ca9d660dc990f87b124ff9a999cfde4bc3f507dc849cde62b46c61fff191933` | Legacy NSIS installer / auto-update fallback |
| `Upscayl-Next-Setup-1.2.3.exe.blockmap` | 282,909 | `91de82ea501459bf777d867fd643a7a209290b538c039802b882b355eb243d1e` | Electron auto-update block map |
| `Upscayl-Next-Setup-1.2.3.zip` | 314,448,601 | `31b5297823ec037eaefe03682c4313490ea341bc5099bc2d3dbda441b378c954` | Portable ZIP package downloaded by the custom installer |
| `latest.yml` | 353 | `c54345f324e9a486360ea141df52f69efab74391a055d543b25534320bfa7460` | electron-updater feed metadata |
| `SHA256SUMS.txt` | 475 | — | Checksums for the assets above |

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
- `electron/commands/video-upscayl.ts`
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
Get-FileHash dist/Upscayl-Next-Setup-1.2.3.exe -Algorithm SHA256
Get-FileHash installer/dist/Upscayl-Next-Installer-1.2.3.exe -Algorithm SHA256
```

## Release checklist

- [x] Version set to `1.2.3` in `package.json` and `package-lock.json`
- [x] Four animated NSIS pages configured (`build/installer.nsh`)
- [x] Optional AI backend setup, Start Menu shortcut and credits page added
- [x] Animated AVIs and branded sidebar/header generated
- [x] Legacy Windows NSIS installer built
- [x] Portable ZIP built (downloaded by the custom installer)
- [x] Custom modern Electron downloader built (`installer/dist/Upscayl-Next-Installer-1.2.3.exe`)
- [x] Auto-update metadata (`latest.yml`) generated
- [x] SHA-256 checksums generated
- [x] `README.md` updated with added features and install steps
- [ ] GitHub Release `v1.2.3` created and assets uploaded
  (https://github.com/yu7783/Upscayl-Next/releases/tag/v1.2.3)
