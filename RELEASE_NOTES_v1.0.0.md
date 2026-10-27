# Upscayl-Next v1.0.0

AI image and video upscaling for Windows, with a modern animated installer.

## Highlights

- **Animated Windows installer** — custom NSIS welcome page with an animated Upscayl-Next banner,
  branded sidebar and header artwork.
- **Automatic VRAM recovery** — detects `vkAllocateMemory failed` /
  `vk Allocated memory failed` and retries with a smaller tile size
  (`512 → 256 → 128 → 64 → 32`) for single images, batch, double upscale and video frames.
- **Video upscaling (experimental)** — extract frames with FFmpeg, upscale every frame, and
  re-encode with audio preserved.
- **Per-model auto-optimization** — recommended scale, tile size, TTA, compression and thread
  split for every bundled model.
- **Performance controls** — manual tile size and `load:process:save` thread split (`-j`).
- **Metadata copy**, batch mode, double upscale and custom models.

## Installation (Windows 10/11)

1. Download **`Upscayl-Next-Setup-1.0.0.exe`** below.
2. Run the installer. The first page plays the animated Upscayl-Next banner.
3. Choose an installation folder and finish the wizard.
4. Launch **Upscayl-Next** from the Start Menu or desktop shortcut.

Portable users can download **`Upscayl-Next-Setup-1.0.0.zip`** and run
`Upscayl-Next.exe` after extracting.

### Requirements

- A **Vulkan-compatible GPU** is required for AI upscaling.
- **FFmpeg** must be available in `PATH` for video upscaling.

## Release assets

| Asset | Description |
| --- | --- |
| `Upscayl-Next-Setup-1.0.0.exe` | Windows NSIS installer with animated UI |
| `Upscayl-Next-Setup-1.0.0.exe.blockmap` | Auto-update block map |
| `Upscayl-Next-Setup-1.0.0.zip` | Portable ZIP build |
| `latest.yml` | electron-updater feed metadata |
| `SHA256SUMS.txt` | SHA-256 checksums |

Verify the installer:

```powershell
Get-FileHash .\Upscayl-Next-Setup-1.0.0.exe -Algorithm SHA256
# Expected: b7d22cac2f146d65902eb09f9c5b481d9a0489b1a1fac482bda2d0f7050c5a4c
```

## Troubleshooting

If `vkAllocateMemory failed -2` still appears after the automatic retries, the GPU is out of
VRAM even at a 32px tile size. Close other GPU-heavy applications, update the graphics driver,
lower the output scale, or use a lighter model such as **Upscayl-Next Lite**.

## Full changelog

See [RELEASE_FILES.md](RELEASE_FILES.md) for the complete source and asset manifest, and
[README.md](README.md) for features and development instructions.
