# Upscayl-Next v1.2.4 Release Manifest

This file lists every artifact and source file required for the GitHub `v1.2.4`
release. App artifacts are generated into `dist/`; the custom installer is
generated into `installer/dist/`.

## GitHub Release assets (upload these)

| File | Size (bytes) | SHA-256 | Purpose |
| --- | ---: | --- | --- |
| `Upscayl-Next-Installer-1.2.4.exe` | 74,358,721 | `f2d8df9121b4cf75469a150ceff92a60cc1d1496ddcec2ecb9add774a2833012` | Custom modern Electron downloader (recommended) |
| `Upscayl-Next-Setup-1.2.4.exe` | 269,520,996 | `1867689fe8ac8ec3d08d23c464cdab28cd058d1e6125eb1b097d93f801ff1dff` | Legacy NSIS installer / auto-update fallback |
| `Upscayl-Next-Setup-1.2.4.exe.blockmap` | 282,871 | `03a443432922e3201e12d8602dd0d4b448fa0c03bd1ac469192f5df090c56450` | Electron auto-update block map |
| `Upscayl-Next-Setup-1.2.4.zip` | 314,448,584 | `b3845a4977e90a607a711e87a3c1bafb8745b42dde7ab466ee7b6975523a35a4` | Portable ZIP package downloaded by the custom installer |
| `latest.yml` | 353 | `e66f4662cb9cd0edc348a923e1b443741ae90716dde7f05d69dd38bbb634401c` | electron-updater feed metadata |
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
- `RELEASE_NOTES_v1.2.4.md`

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
Get-FileHash dist/Upscayl-Next-Setup-1.2.4.exe -Algorithm SHA256
Get-FileHash installer/dist/Upscayl-Next-Installer-1.2.4.exe -Algorithm SHA256
```

## Release checklist

- [x] Version set to `1.2.4` in `package.json` and `package-lock.json`
- [x] Four animated NSIS pages configured (`build/installer.nsh`)
- [x] Optional AI backend setup, Start Menu shortcut and credits page added
- [x] Animated AVIs and branded sidebar/header generated
- [x] Legacy Windows NSIS installer built
- [x] Portable ZIP built (downloaded by the custom installer)
- [x] Custom modern Electron downloader built (`installer/dist/Upscayl-Next-Installer-1.2.4.exe`)
- [x] Auto-update metadata (`latest.yml`) generated
- [x] SHA-256 checksums generated
- [x] `README.md` updated with added features and install steps
- [ ] GitHub Release `v1.2.4` created and assets uploaded
  (https://github.com/yu7783/Upscayl-Next/releases/tag/v1.2.4)
