# Upscayl-Next v1.0.0 Release Manifest

This file lists every artifact and source file required for the GitHub `v1.0.0`
release. All installer artifacts are generated into `dist/`.

## GitHub Release assets (upload these)

| File | Size (bytes) | SHA-256 | Purpose |
| --- | ---: | --- | --- |
| `Upscayl-Next-Setup-1.0.0.exe` | 268,971,799 | `b7d22cac2f146d65902eb09f9c5b481d9a0489b1a1fac482bda2d0f7050c5a4c` | Windows installer (animated NSIS welcome page) |
| `Upscayl-Next-Setup-1.0.0.exe.blockmap` | 282,194 | `a6fc04367b8ece492fd7e13fa9b885a5633b2166728ade54a02f0f3bfa418358` | Electron auto-update block map |
| `Upscayl-Next-Setup-1.0.0.zip` | 314,407,675 | `947642b61a7951010619ba204c0f73da2b3819283e0c2385d30902e309e448de` | Portable ZIP build |
| `latest.yml` | 353 | `3ee5cf0f3de32e73faa1590f52ba516f457870fd06978a6d8c3dde45e93cc6fd` | electron-updater feed metadata |
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

### Renderer (Next.js UI)
- `renderer/`

### Installer assets and scripts
- `build/icon.png`
- `build/installer.nsh`
- `build/anim/banner.avi`
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

## Build and verification

```powershell
# 1. Generate the animated installer artwork
pwsh -NoProfile -File scripts/generate-installer-assets.ps1

# 2. Build the animated AVI banner
ffmpeg -y -framerate 8 -i build/anim/banner%02d.bmp \
  -c:v rawvideo -pix_fmt bgr24 build/anim/banner.avi

# 3. Run tests
npm test

# 4. Build the Windows installer
npm run dist:win

# 5. Verify checksums
Get-Content dist/SHA256SUMS.txt
Get-FileHash dist/Upscayl-Next-Setup-1.0.0.exe -Algorithm SHA256
```

## Release checklist

- [x] Version set to `1.0.0` in `package.json`
- [x] Animated NSIS welcome page configured (`build/installer.nsh`)
- [x] Animated banner and branded sidebar/header generated
- [x] Windows NSIS installer built
- [x] Portable ZIP built
- [x] Auto-update metadata (`latest.yml`) generated
- [x] SHA-256 checksums generated
- [x] `README.md` updated with added features and install steps
- [ ] GitHub Release `v1.0.0` created and assets uploaded
