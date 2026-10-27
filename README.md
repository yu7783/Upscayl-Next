<div align="center">

# Upscayl-Next

**AI image and video upscaling for Windows**

[![Latest release](https://img.shields.io/github/v/release/yu7783/Upscayl-Next?style=for-the-badge)](https://github.com/yu7783/Upscayl-Next/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/yu7783/Upscayl-Next/total.svg?style=for-the-badge)](https://github.com/yu7783/Upscayl-Next/releases)

[Download the latest release](https://github.com/yu7783/Upscayl-Next/releases/latest) ·
[Release notes](RELEASE_NOTES_v1.0.0.md) ·
[Report an issue](https://github.com/yu7783/Upscayl-Next/issues)

</div>

Upscayl-Next is a Windows-focused fork of [Upscayl](https://github.com/upscayl/upscayl).
It uses Real-ESRGAN and the NCNN Vulkan backend to enlarge images and videos
without losing quality.

> [!IMPORTANT]
> This fork currently publishes **Windows x64 builds only**. For Linux and macOS,
> use the upstream [Upscayl releases](https://github.com/upscayl/upscayl/releases).

# ✨ What's new in this fork?

- **🎬 Video upscaling (experimental)** — extract frames with FFmpeg, upscale every
  frame, and re-encode the video with its audio track.
- **🧠 Automatic VRAM recovery** — detects `vkAllocateMemory failed`,
  `vk Allocated memory failed` and related Vulkan errors, then retries with a
  smaller tile size (`512 → 256 → 128 → 64 → 32`) for single images, batch,
  double upscale and video frames.
- **⚡ Per-model auto-optimization** — bundled models come with recommended scale,
  tile size, TTA, compression and thread settings. Enable *Auto-optimize settings*
  to apply them automatically.
- **🧵 Thread split tuning** — advanced users can pin the `load:process:save`
  thread split (`-j`) used by the NCNN backend.
- **🎛 Tile size control** — lower the tile size manually on GPUs with very little VRAM.
- **🖼 Metadata copy** — keep EXIF metadata in upscaled images.
- **📦 Animated Windows installer** — custom NSIS welcome page with an animated
  Upscayl-Next banner, branded sidebar and header.

# Contents

- [✨ What's new in this fork?](#-whats-new-in-this-fork)
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

## Windows installer

1. Open the [latest release](https://github.com/yu7783/Upscayl-Next/releases/latest).
2. Download **`Upscayl-Next-Setup-1.0.0.exe`**.
3. Run the installer. The first page plays the animated Upscayl-Next banner.
4. Choose an installation folder and finish the wizard.
5. Launch **Upscayl-Next** from the Start Menu or the desktop shortcut.

> [!NOTE]
> The installer is **not code-signed**, so Windows SmartScreen may show a warning.
> Click **More Info → Run Anyway** to continue.

## Portable ZIP

1. Download **`Upscayl-Next-Setup-1.0.0.zip`** from the same release.
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
- [Release manifest for v1.0.0](RELEASE_FILES.md)
- [Release notes for v1.0.0](RELEASE_NOTES_v1.0.0.md)

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

```sh
npm run dist:win
```

Outputs:

- `dist/Upscayl-Next-Setup-1.0.0.exe`
- `dist/Upscayl-Next-Setup-1.0.0.exe.blockmap`
- `dist/Upscayl-Next-Setup-1.0.0.zip`
- `dist/latest.yml`

Generate or verify checksums with:

```powershell
Get-FileHash dist\Upscayl-Next-Setup-1.0.0.exe -Algorithm SHA256
```

## Installer artwork

The animated welcome banner and branded installer images are generated from
`build/icon.png`:

```sh
pwsh -NoProfile -File scripts/generate-installer-assets.ps1

ffmpeg -y -framerate 8 -i build/anim/banner%02d.bmp \
  -c:v rawvideo -pix_fmt bgr24 build/anim/banner.avi
```

`build/installer.nsh` is loaded through the `nsis.include` option in
`package.json`.

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

