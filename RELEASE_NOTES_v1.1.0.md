# Upscayl-Next v1.1.0

Native HAT / DAT / SUPIR support for Windows and Linux/macOS source builds.

## Highlights

- **Native HAT / DAT / SUPIR backend** — a bundled Python worker speaks the same
  command-line interface as `upscayl-bin`, so the existing single-image, batch,
  double-upscale and video pipelines work unchanged.
  - **HAT (Hybrid Attention Transformer)** and **DAT / DAT2 (Dual Aggregation
    Transformer)** load `.pth`, `.pt`, `.ckpt` and `.safetensors` checkpoints via
    [spandrel](https://github.com/chaiNNer-org/spandrel).
  - **SUPIR (Super-Scale Image Restoration)** integrates the official SUPIR
    diffusion pipeline with an SDXL base checkpoint.
  - Generic PyTorch/SwinIR/Real-ESRGAN checkpoints and `.onnx` graphs are also
    accepted.
- **Automatic engine routing** — `.param`/`.bin` pairs keep using the fast Vulkan
  binary. HAT, DAT, SUPIR and other PyTorch/ONNX models automatically use the
  Python worker; no manual switch is required.
- **Full pipeline parity** — tiling (`-t`), TTA (`-x`), custom width (`-w`),
  compression (`-c`), output format, GPU selection and the `load:process:save`
  thread split are supported for native models.
- **ONNX fixed-size graphs** — models exported without dynamic axes are tiled
  automatically so they work without manual tile-size tuning.
- **Clearer model labels** — custom model badges now show `HAT`, `DAT / DAT2`,
  `SUPIR`, `ONNX` or `PyTorch` while still reporting the file engine.
- **Model Scale is respected** — request 2x from a 4x model to get one pass plus
  a Lanczos downscale; request more than the native scale to run repeated passes.
- **Packaging** — `native/` is copied next to `app.asar` via `extraResources`
  (excluding `.venv` and Python caches). Run `npm run native:setup` once to
  install PyTorch, spandrel and ONNX Runtime.

## Installation (Windows 10/11)

1. Download **`Upscayl-Next-Setup-1.1.0.exe`** below.
2. Run the installer. The first page plays the animated Upscayl-Next banner.
3. Choose an installation folder and finish the wizard.
4. Launch **Upscayl-Next** from the Start Menu or desktop shortcut.

Portable users can download **`Upscayl-Next-Setup-1.1.0.zip`** and run
`Upscayl-Next.exe` after extracting.

### Requirements

- A **Vulkan-compatible GPU** for the bundled NCNN models.
- **FFmpeg** in `PATH` for video upscaling.
- **Python 3.10 or 3.11** only when using HAT/DAT/SUPIR. Run
  `npm run native:setup` from the source tree (or set `UPSCAYL_PYTHON`).
- SUPIR additionally requires a CUDA GPU, a clone of
  [Fanghua-Yu/SUPIR](https://github.com/Fanghua-Yu/SUPIR) and an SDXL base
  checkpoint. See `native/README.md`.

## Using HAT / DAT / SUPIR

1. Download the model weights into a folder of their own.
2. In Upscayl-Next open **Settings → Custom models folder** and select it.
3. Pick the model in the model selector. The badge shows the detected engine.
4. Click **Upscayl-Next 🚀**.

## Release assets

| Asset | Description |
| --- | --- |
| `Upscayl-Next-Setup-1.1.0.exe` | Windows NSIS installer with animated UI |
| `Upscayl-Next-Setup-1.1.0.exe.blockmap` | Auto-update block map |
| `Upscayl-Next-Setup-1.1.0.zip` | Portable ZIP build |
| `latest.yml` | Auto-update metadata |
