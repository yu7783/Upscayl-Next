# Native HAT / DAT / SUPIR backend

This folder contains the native Python worker used by Upscayl-Next when the
selected model architecture cannot be executed by `upscayl-bin` (ncnn/Vulkan).
It keeps the same command-line contract as `upscayl-bin`, so the Electron main
process does not need separate code paths for HAT, DAT or SUPIR.

## Supported architectures

| Family | Typical checkpoints | Engine |
| --- | --- | --- |
| HAT (Hybrid Attention Transformer) | `HAT*.pth`, `4x-HAT*.safetensors` | spandrel |
| DAT (Dual Aggregation Transformer) | `DAT*.pth`, `DAT*.safetensors` | spandrel |
| SUPIR (Super-Scale Image Restoration) | `SUPIR-v0Q.ckpt`, `SUPIR-v0F.ckpt` | SUPIR pipeline + SDXL base |

Generic Real-ESRGAN/SwinIR/ESRGAN checkpoints and `.onnx` graphs are also
accepted. Any file placed in the models folder (or in the "custom models"
folder configured in Settings) appears in the model list automatically.

## Installation

```powershell
# Windows (from the upscayl/ folder)
npm run native:setup
# or with NVIDIA CUDA 12.4 wheels
powershell -ExecutionPolicy Bypass -File native/setup.ps1 -Cuda cu124
```

```bash
# Linux / macOS
npm run native:setup:unix
# or
bash native/setup.sh --cuda cu124
```

`setup.ps1` creates `native/.venv` and installs PyTorch, spandrel and
onnxruntime. spandrel currently requires **Python 3.10/3.11** (< 3.12).

The Python interpreter is detected in this order:

1. `UPSCAYL_PYTHON` (path or command name)
2. `native/.venv/Scripts/python.exe` (Windows) or `native/.venv/bin/python`
3. `%APPDATA%/Upscayl-Next/native-backend/venv` for packaged builds
4. `python3` / `python` on `PATH`

The application automatically routes HAT/DAT/SUPIR models to the Python worker.
No manual switch is required; models unknown to the native worker are still sent
to the bundled `upscayl-bin`.

## SUPIR setup

SUPIR needs its upstream repository and an SDXL base checkpoint in addition to
the SUPIR weights:

```bash
git clone https://github.com/Fanghua-Yu/SUPIR.git
```

Then point the application at the clone and the base model:

| Variable | Meaning | Default |
| --- | --- | --- |
| `UPSCAYL_SUPIR_REPO` | Path to the cloned SUPIR repository | searched next to the model and the app |
| `UPSCAYL_SUPIR_OPTIONS` | Path to the SUPIR YAML | `<repo>/options/SUPIR_v0.yaml` |
| `UPSCAYL_SUPIR_SDXL_CKPT` | Path to the SDXL base checkpoint | value already in the YAML |
| `UPSCAYL_SUPIR_EDM_STEPS` | Diffusion steps (quality/speed) | `50` |
| `UPSCAYL_SUPIR_CFG` | Text guidance scale | `4.0` |
| `UPSCAYL_SUPIR_S_STAGE1` | Restoration scale (`-1` = automatic) | `-1` |
| `UPSCAYL_SUPIR_S_STAGE2` | Control scale | `1.0` |
| `UPSCAYL_SUPIR_COLOR_FIX` | `Wavelet`, `AdaIN` or `None` | `Wavelet` |
| `UPSCAYL_SUPIR_USE_LLAVA` | Set to `1` to caption with LLaVA | disabled |
| `UPSCAYL_SUPIR_POSITIVE_PROMPT` | Override the positive prompt | built-in |
| `UPSCAYL_SUPIR_NEGATIVE_PROMPT` | Override the negative prompt | built-in |

A selected `.ckpt`/`.safetensors`/`.pth` file is written into a temporary copy of
the YAML as `SUPIR_CKPT_Q` (or `SUPIR_CKPT_F` when the name contains `v0F`), so
the checkpoint chosen in Upscayl's model list is the one that runs. The YAML
itself is never modified.

SUPIR requires CUDA and a reasonably large GPU. Diffusion inference is much
slower than the feed-forward HAT/DAT models, so prefer `--tile-size 1024` or
larger for high-resolution inputs. Upscayl's batch "Model Scale" setting is
honoured: if you request a 2x output from a 4x model the worker produces one
4x pass and downsizes with Lanczos.

## GPU selection

The UI's GPU picker sends a Vulkan device index (`-g`). The native worker maps it
to a CUDA device index when CUDA is available. If the mapping does not match
your GPU, set `UPSCAYL_NATIVE_CUDA_DEVICE` to the correct CUDA index:

| Variable | Meaning | Default |
| --- | --- | --- |
| `UPSCAYL_NATIVE_CUDA_DEVICE` | Force a CUDA device index | value of `-g`, clamped to the device count |
| `UPSCAYL_NATIVE_FP16` | Set to `1` to run feed-forward models in half precision on CUDA | disabled |

## Models and scale

HAT/DAT checkpoints expose their native scale to spandrel. If a checkpoint does
not, or an ONNX graph is used, the worker reads `2x`/`3x`/`4x` from the file name
(`4x-HAT...`, `DAT-x2`) and defaults to 4x. The "Model Scale" dropdown in the UI
is respected for all native families:

- `Model Scale == model native scale`: single pass.
- `Model Scale < native scale`: one pass followed by a Lanczos downscale.
- `Model Scale > native scale`: repeated passes until the requested factor is
  reached.

## Troubleshooting

- **"Native backend not installed"** – run `npm run native:setup`.
- **HAT/DAT still opens the ncnn worker** – the extension must be
  `.pth`, `.pt`, `.safetensors`, `.ckpt` or `.onnx`, and the file must exist in
  the selected models folder.
- **Spandrel "Unsupported model"** – the checkpoint architecture is newer than
  the installed spandrel version. Update with
  `native/.venv/Scripts/python.exe -m pip install -U spandrel`.
- **SUPIR "No module named SUPIR"** – set `UPSCAYL_SUPIR_REPO`.
- **CUDA out of memory** – increase tile size only if the GPU has headroom;
  otherwise reduce it. For SUPIR use a smaller `--tile-size`.
