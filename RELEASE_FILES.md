# Upscayl-Next v1.2.2 Release Manifest

This file lists every artifact and source file required for the GitHub `v1.2.2`
release. All installer artifacts are generated into `dist/`.

## GitHub Release assets (upload these)

| File | Size (bytes) | SHA-256 | Purpose |
| --- | ---: | --- | --- |
| `Upscayl-Next-Setup-1.2.2.exe` | 269,521,204 | `b717f330f4fe1fa1187b6708eaef433ca3669d299c6c9ae3c5e6bdec187c2ce1` | Windows installer (four animated NSIS pages, fixed layout) |
| `Upscayl-Next-Setup-1.2.2.exe.blockmap` | 282,894 | `9603bd95a132bb8456aa80fdf9b9ec6bea9b4021f58c82994239167d70be5377` | Electron auto-update block map |
| `Upscayl-Next-Setup-1.2.2.zip` | 314,448,596 | `3ac200e6d91c80978e61dcba97e66cd82a4f0a5751dc51ed566c724b5d58cf06` | Portable ZIP build |
| `latest.yml` | 353 | `f1e915d617b5e574302bbb511fc5004b97c358460d83f797b2e4f32682c19eec` | electron-updater feed metadata |
| `SHA256SUMS.txt` | 375 | — | Checksums for the assets above |

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

## Build and verification

```powershell
# 1. Run tests
npm test

# 2. Build the Windows installer (predist:win regenerates the artwork)
npm run dist:win

# 3. Verify checksums
Get-Content dist/SHA256SUMS.txt
Get-FileHash dist/Upscayl-Next-Setup-1.2.2.exe -Algorithm SHA256
```

## Release checklist

- [x] Version set to `1.2.2` in `package.json` and `package-lock.json`
- [x] Four animated NSIS pages configured (`build/installer.nsh`)
- [x] Optional AI backend setup, Start Menu shortcut and credits page added
- [x] Animated AVIs and branded sidebar/header generated
- [x] Windows NSIS installer built
- [x] Portable ZIP built
- [x] Auto-update metadata (`latest.yml`) generated
- [x] SHA-256 checksums generated
- [x] `README.md` updated with added features and install steps
- [x] GitHub Release `v1.2.2` created and assets uploaded
  (https://github.com/yu7783/Upscayl-Next/releases/tag/v1.2.2)
