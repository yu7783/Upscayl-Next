<div align="center">

# Upscayl-Next

**AI image and video upscaling for Windows**

[![Latest release](https://img.shields.io/github/v/release/yu7783/Upscayl-Next?style=for-the-badge)](https://github.com/yu7783/Upscayl-Next/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/yu7783/Upscayl-Next/total.svg?style=for-the-badge)](https://github.com/yu7783/Upscayl-Next/releases)

[Download the latest release](https://github.com/yu7783/Upscayl-Next/releases/latest) ·
[Release notes](RELEASE_NOTES_v1.2.3.md) ·
[Report an issue](https://github.com/yu7783/Upscayl-Next/issues)

</div>

Upscayl-Next is a Windows-focused fork of [Upscayl](https://github.com/upscayl/upscayl).
It uses Real-ESRGAN and the NCNN Vulkan backend to enlarge images and videos
without losing quality.

> [!IMPORTANT]
> This fork currently publishes **Windows x64 builds only**. For Linux and macOS,
> use the upstream [Upscayl releases](https://github.com/upscayl/upscayl/releases).

# ✨ What's changed from upstream?

Upscayl-Next is based on upstream **Upscayl 2.15.0**. The fork uses its own
versioning and starts at **1.0.0** (current release: **1.2.3**).

Compared with the upstream tree, this release contains **more than 200 changed
files**, including a complete Windows installer overhaul with animated pages,
optional AI backend setup and packaged license notices.

## Added

| Area | Change | Main files |
| --- | --- | --- |
| Video upscaling | Extract frames with FFmpeg, upscale each frame, re-encode to MP4 with audio | `electron/commands/video-upscayl.ts`, `select-video.ts`, `common/video-formats.ts` |
| VRAM recovery | Detect `vkAllocateMemory failed` / `vk Allocated memory failed` and retry at `512→256→128→64→32` tile sizes | `common/vulkan-memory.ts`, all upscale commands |
| Batch + double | Process a whole folder twice; batch takes priority over double (fixes #1405) | `common/resolve-upscayl-mode.ts`, `batch-upscayl.ts` |
| Model profiles | Recommended scale, tile size, TTA, compression and threads per bundled model | `common/model-profiles.ts`, `auto-optimize-toggle.tsx` |
| Thread tuning | Auto or manual `load:process:save` split (`-j`) based on CPU cores | `common/thread-count.ts`, `input-threads.tsx`, `get-arguments.ts` |
| Model compatibility | Detect NCNN `.param/.bin` plus ONNX / PyTorch extensions and label them in the UI | `common/model-compatibility.ts`, `get-models.ts` |
| Model guidance | Model picker explains bundled vs custom models, shows engine badges, optional AI backend requirements, supported formats and an empty-state guide | `select-model-dialog.tsx`, `select-custom-models-folder.tsx`, locales |
| Native HAT / DAT / SUPIR | Run transformer and diffusion upscalers in a bundled Python backend (spandrel, ONNX Runtime, official SUPIR), routed automatically by model name/extension | `native/`, `common/model-runtime.ts`, `electron/utils/spawn-upscayl.ts` |
| Structured progress | Pass number, total passes, completed and total counts for batch jobs | `electron-commands.ts`, `batch-upscayl.ts`, `progress-bar.tsx` |
| Video tab | Dedicated video workflow: video, model, output, scale, start/stop | `sidebar/video-tab/index.tsx`, `tabs.tsx` |
| Custom modern installer | Electron downloader with animated dark UI, step rail, download progress ring with speed/ETA, SHA-256 verification, per-user install, shortcuts, uninstaller and optional AI backend | `installer/`, `package.json` |
| Legacy NSIS installer | Dark animated NSIS wizard (welcome, credits, options and finish pages) kept for auto-update and fallback | `build/installer.nsh`, `build/anim/`, `scripts/generate-installer-assets.ps1`, `native/setup-launcher.ps1` |
| Release manifest | Asset list, SHA-256 checksums and v1.2.3 release notes | `RELEASE_FILES.md`, `RELEASE_NOTES_v1.2.3.md` |

## Improved and fixed

- **Windows paths containing `%`** no longer crash `decodeURIComponent`; the raw path is used as a fallback.
- **Progress parsing** no longer allocates a match array for every log line (`count-occurrences.ts`).
- **Batch input validation** prevents the cryptic "both must be a file or a directory" error.
- **Batch double-upscale** uses a temporary folder and falls back to the OS temp directory.
- **Batch metadata copy** runs in chunks of 8 to avoid opening thousands of handles.
- **Double upscale progress** now reports the overall two-pass progress instead of restarting at 100%.
- **Image input validation** checks the input file, output folder and Windows path length.
- **Video error handling** cleans up temporary frames after failures and reports each stage.
- **Auto-update** now opens fork release notes under `yu7783/Upscayl-Next`.
- **Custom model folder** accepts NCNN, ONNX and PyTorch checkpoint extensions.

## UI and UX

- Rebranded the UI from Upscayl to Upscayl-Next (header, footer, logo, version badge and locales).
- Header and footer links point to the fork repository.
- Added a video tab alongside image and batch modes.
- Reworked the progress overlay with batch/pass progress, elapsed time and ETA.
- Added Auto-optimize settings and thread-split controls.
- Replaced `lucide-react` icons with a bundled icon set.
- Replaced upstream model-comparison images with `original-placeholder.svg`.
- Removed PostHog telemetry and the contributions toggle.

## Build and release

- `name`: `upscayl` → `upscayl-next`
- `productName`: `Upscayl` → `Upscayl-Next`
- `appId`: `org.upscayl.Upscayl` → `org.upscaylnext.UpscaylNext`
- `publisherName`: `Upscayl Team` → `Upscayl-Next Team`
- Versioning starts at `1.0.0` instead of upstream `2.15.0`.
- Artifacts are named `Upscayl-Next-Setup-<version>.exe` / `.zip` (currently `1.2.3`).
- GitHub publish target is `yu7783/Upscayl-Next`.
- Installer shortcuts, run-after-finish, custom sidebar/header and animated welcome page.
- macOS config uses PNG icons instead of `.icns`.
- Added `npm test` (`tsc && node --test tests`).

## Removed

- Upstream demo media: `1080p_banner.jpg`, `1080p_explainer.jpg`, `download.jpg`,
  `screen1.png`, `to_upscale.jpeg`, `ups/to_upscale.jpeg`, `upscayl.mp4`.
- Upstream model-comparison WebP images.
- Sample images `scripts/baboon.png` and `scripts/baboon_upscaled.png`.
- PostHog integration and the "Enable contributions" toggle.
- macOS `.icns` icons.

## Tests and docs

- Added tests for model compatibility, model profiles, thread/performance helpers,
  mode resolution and Vulkan memory handling.
- Rewrote this README for the Windows-only fork.
- Updated `scripts/test.py` to generate a synthetic test image instead of using bundled photos.
- Removed the deleted macOS screenshot reference from the troubleshooting docs.
- Added installer artwork generation and Windows build/release instructions.

## Native HAT / DAT / SUPIR support

Transformer and diffusion upscalers cannot run in the NCNN Vulkan binary, so the
fork ships a small Python worker in `native/` that speaks the same command-line
interface as `upscayl-bin`:

| Family | Checkpoints | Engine |
| --- | --- | --- |
| HAT (Hybrid Attention Transformer) | `*.pth`, `*.safetensors` | [spandrel](https://github.com/chaiNNer-org/spandrel) |
| DAT / DAT2 (Dual Aggregation Transformer) | `*.pth`, `*.safetensors` | spandrel |
| SUPIR (Super-Scale Image Restoration) | `SUPIR-v0Q.ckpt`, `SUPIR-v0F.ckpt` | official SUPIR pipeline + SDXL |
| Any other SR model | `*.onnx` | ONNX Runtime |

Routing is automatic: `.param`/`.bin` pairs keep using the bundled Vulkan binary,
while `.pth`/`.pt`/`.ckpt`/`.safetensors`/`.onnx` files and HAT/DAT/SUPIR model
names run in the native worker. Tiling (`-t`), TTA (`-x`), custom width (`-w`),
compression (`-c`) and the output format are all supported for native models.

### Enable the native backend

The Windows installer offers an **optional AI backend** checkbox on its options
page. When selected, setup runs automatically during installation. If you skip
it, open **Start Menu → Upscayl-Next – Set up AI backend** at any time; the
launcher asks for administrator permission and runs the same setup script.

For source builds you can still run it manually:

```powershell
cd upscayl
npm run native:setup
```

This creates `native/.venv` with Python 3.10/3.11 and installs PyTorch, spandrel
and ONNX Runtime. Packaged builds copy `native/` into the app resources; point
`UPSCAYL_PYTHON` at a compatible interpreter if you prefer an existing venv.

### Using the models

1. Download HAT/DAT/SUPIR weights into a folder of their own.
2. In Upscayl-Next open **Settings → Custom models folder** and select it.
3. Pick the model in the model selector. The badge shows the engine
   (`HAT`, `DAT / DAT2`, `SUPIR`, `ONNX`, `PyTorch`).

SUPIR additionally needs a clone of
[Fanghua-Yu/SUPIR](https://github.com/Fanghua-Yu/SUPIR) and an SDXL base
checkpoint; set `UPSCAYL_SUPIR_REPO` and `UPSCAYL_SUPIR_SDXL_CKPT`, or edit the
repository's `options/SUPIR_v0.yaml`. SUPIR is diffusion-based and requires CUDA,
so expect minutes rather than seconds per image. See
[`native/README.md`](native/README.md) for every environment variable and for
troubleshooting.

## Not changed

- The bundled NCNN models and the core upscaling quality.
- Existing upstream workflows such as single image, batch and double upscale.

# Contents

- [✨ What's changed from upstream?](#-whats-changed-from-upstream)
- [🧠 Native HAT / DAT / SUPIR support](#-native-hat--dat--supir-support)
- [👨‍💻 Installation](#-installation)
- [🚀 Quick start](#-quick-start)
- [🩺 Troubleshooting](#-troubleshooting)
- [📚 Documentation](#-documentation)
- [🛠 Development](#-development)
- [🤓 FAQ](#-faq)
- [📄 License and credits](#-license-and-credits)

# 👨‍💻 Installation

## Requirements

- Windows 10 or 11 (x64)
- A **Vulkan-compatible GPU** (most integrated GPUs are not supported)
- **FFmpeg and FFprobe** in `PATH` for video upscaling
- At least 2 GB of free disk space for the app and bundled models
- **Python 3.10 or 3.11** (optional) only when you want native HAT/DAT/SUPIR
  models; the bundled NCNN models do not need Python

## Windows installer

The recommended download is the custom **modern downloader**:

1. Open the [latest release](https://github.com/yu7783/Upscayl-Next/releases/latest).
2. Download **`Upscayl-Next-Installer-1.2.3.exe`**.
3. Run it. The animated downloader checks GitHub for the latest portable
   package, verifies its SHA-256 checksum and installs it per-user.
4. Choose the installation folder and shortcuts. You can optionally install the
   HAT/DAT/SUPIR AI backend during setup.
5. Finish and launch **Upscayl-Next** from the Start Menu or desktop shortcut.

The older NSIS installer (`Upscayl-Next-Setup-1.2.3.exe`) is still published for
auto-update and as a fallback, but new users should use the custom downloader.

> [!NOTE]
> The installer is **not code-signed**, so Windows SmartScreen may show a warning.
> Click **More Info → Run Anyway** to continue. The custom downloader needs an
> internet connection to fetch the latest package.

## Portable ZIP

1. Download **`Upscayl-Next-Setup-1.2.3.zip`** from the same release.
2. Extract the archive to a folder of your choice.
3. Run `Upscayl-Next.exe`.

## Upgrading or reinstalling

Run a newer installer over the existing installation. Settings and custom models
are kept. If an image already has an upscaled output, enable **Overwrite previous
upscale** to process it again.

# 🚀 Quick start

1. Select a model. The bundled models cover photos, digital art, text and
   low-end GPUs.
2. Choose an input image or a folder (batch mode).
3. Select the output folder and scale.
4. Click **Upscayl-Next 🚀**.

### Video upscaling

1. Install FFmpeg and make sure both `ffmpeg` and `ffprobe` are available in `PATH`.
2. Select a video, output folder, model and scale.
3. Start the upscale. Frames are extracted, upscaled and encoded to MP4 (H.264/AAC).

# 🩺 Troubleshooting

| Problem | Fix |
| --- | --- |
| `vkAllocateMemory failed -2` | The automatic tile fallback already ran. Close other GPU apps, update the driver, lower the scale, or use a lighter model. |
| `FFmpeg was not found` | Install FFmpeg and add its `bin` folder to `PATH`. `ffprobe` must be available too. |
| `No frames were extracted` | Check that the video is readable and that FFmpeg supports its codec. |
| `Invalid GPU` | Set the correct **GPU ID**, disable switchable graphics, or select your discrete GPU. |
| SmartScreen warning | Expected for an unsigned build. Click **More Info → Run Anyway**. |

# 📚 Documentation

- [Upstream Upscayl documentation](https://docs.upscayl.org/)
- [Before/after comparisons](COMPARISONS.MD)
- [Additional custom models](https://github.com/upscayl/custom-models)
- [Upstream troubleshooting guide](https://github.com/upscayl/upscayl/wiki/Troubleshooting)
- [Release manifest for v1.2.3](RELEASE_FILES.md)
- [Release notes for v1.2.3](RELEASE_NOTES_v1.2.3.md)

# 🛠 Development

## Requirements

- Node.js 18.20.5 (the repository pins this version through Volta)
- npm
- Windows for building the NSIS installer
- FFmpeg for generating the installer animation

## Running from source

```sh
git clone https://github.com/yu7783/Upscayl-Next.git
cd Upscayl-Next

npm install
npm run start
```

`npm run start` compiles the TypeScript sources and launches Electron.

## Tests

```sh
npm test
```

This runs `tsc` and the Node.js test suite in `tests/`.

## Building the Windows installer

The `predist:win` hook regenerates the animated installer artwork before the
build, so a normal build is enough:

```sh
npm run dist:win
```

You can also refresh the artwork on its own (requires ffmpeg on PATH):

```powershell
npm run installer-assets
```

Outputs:

- `dist/Upscayl-Next-Setup-1.2.3.exe` (legacy NSIS installer / auto-update)
- `dist/Upscayl-Next-Setup-1.2.3.exe.blockmap`
- `dist/Upscayl-Next-Setup-1.2.3.zip` (portable app package used by the downloader)
- `dist/latest.yml`

Build the custom modern downloader (Electron app in `installer/`):

```powershell
npm run installer-app
```

Output:

- `installer/dist/Upscayl-Next-Installer-1.2.3.exe`

The custom installer downloads the portable ZIP from the latest GitHub release,
verifies `SHA256SUMS.txt`, extracts the app, creates shortcuts, registers an
uninstaller and optionally runs `resources/native/setup.ps1`.

Generate or verify checksums with:

```powershell
Get-FileHash dist\Upscayl-Next-Setup-1.2.3.exe -Algorithm SHA256
Get-FileHash installer\dist\Upscayl-Next-Installer-1.2.3.exe -Algorithm SHA256
```

## Installer artwork and pages

The modern downloader in `installer/` is the primary installer. It uses a
frameless dark window, animated background orbs, a step rail, a download
progress ring with speed/ETA, install log and an animated completion screen.

The legacy `build/installer.nsh` remains for the NSIS fallback and is loaded
through the `nsis.include` option in `package.json`. It uses four dark animated
pages:

`build/installer.nsh` is loaded through the `nsis.include` option in
`package.json`. It replaces the default wizard with four dark animated pages:

| Page | Animation | Purpose |
| --- | --- | --- |
| Welcome | `build/anim/welcome.avi` | Product intro and Vulkan/GPU notice |
| License & credits | `build/anim/credits.avi` | AGPL-3.0 notice, upstream and model credits, acceptance checkbox |
| Options | `build/anim/options.avi` | Optional HAT/DAT/SUPIR Python backend |
| Finish | `build/anim/finish.avi` | Completion message and launch checkbox |

The pages also create a Start Menu shortcut named
**Upscayl-Next – Set up AI backend**, which runs
`native/setup-launcher.ps1` and self-elevates. The optional backend can be
installed during setup or later from that shortcut.

All artwork is generated from `build/icon.png`; no third-party photos, icons,
music or video clips are embedded. The script also writes the static
`installerHeader.bmp` and `installerSidebar.bmp` and converts the BMP frame
sequences to raw AVI with ffmpeg:

```powershell
pwsh -NoProfile -File scripts/generate-installer-assets.ps1
```

If ffmpeg is unavailable the script keeps existing AVI files and falls back to
the legacy `banner.avi` for all animated pages.

## Publishing

Maintainers can publish the Windows build with a GitHub token:

```powershell
$env:GH_TOKEN = "your_token"
npm run publish-win-app
```

# 🤓 FAQ

- **Does this fork work on Linux or macOS?**
  - Releases are currently Windows-only. The source may build on other platforms,
    but only Windows installers are published here. Use upstream Upscayl for
    Linux and macOS.
- **Do I need a GPU?**
  - Yes. The NCNN Vulkan backend needs a Vulkan-compatible GPU. Most integrated
    GPUs will be too slow or unsupported.
- **Why does the installer show a SmartScreen warning?**
  - The build is not code-signed. This is expected.
- **Can I use my own models?**
  - Yes. Put an NCNN `.param` and `.bin` pair in a folder, then select that folder
    through **Settings → Custom models**.
- **Where can I get more models?**
  - See [upscayl/custom-models](https://github.com/upscayl/custom-models).
- **How do I report a bug?**
  - Open an issue at [yu7783/Upscayl-Next/issues](https://github.com/yu7783/Upscayl-Next/issues).

# 📄 License and credits

Upscayl-Next is distributed under the **AGPL-3.0** license. See [LICENSE](LICENSE).

This project is a fork of [Upscayl](https://github.com/upscayl/upscayl) by
Nayam Amarshe and TGS963. The NCNN backend is
[upscayl/upscayl-ncnn](https://github.com/upscayl/upscayl-ncnn).

Additional credits:

- Real-ESRGAN — [Xintao Wang](https://github.com/xinntao/Real-ESRGAN/)
- @JanDeDinoMan, @xanderfrangos, @Fdawgs, @keturn for code contributions
- @aaronliu0130 for community support
- Helaman for the HFA2k model (bundled as **High Fidelity**)
- Foolhardy for the Remacri model
- [Kim2091](https://upscale.wiki/wiki/User:Kim2091) for UltraSharp and Ultramix Balanced
- @NicKoehler for the logo

<div align="center">

Maintained by [yu7783](https://github.com/yu7783)  
Based on Upscayl by Nayam Amarshe and TGS963  
Made with 🖱 & ⌨

</div>

