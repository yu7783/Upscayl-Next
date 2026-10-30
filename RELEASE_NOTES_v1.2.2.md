# Upscayl-Next v1.2.2

Clearer guidance for choosing and installing models.

## Improvements

- **Model picker guide** — the model dialog now explains the difference between
  bundled NCNN models (work immediately) and custom ONNX/PyTorch models
  (HAT/DAT/SUPIR need the optional AI backend).
- **Engine badges** — every model shows an NCNN / ONNX / PyTorch / HAT / DAT /
  SUPIR badge. Custom models also say whether they work out of the box or need
  the optional AI backend.
- **Recommended model** — Upscayl-Next Standard is marked as the recommended
  starting point, with short "best for" descriptions for every bundled model.
- **Empty state** — when no custom models are loaded, the picker explains the
  supported formats (`.param` + `.bin`, `.onnx`, `.pth`, `.pt`, `.ckpt`,
  `.safetensors`) and links to the custom models repository.
- **Settings → Models** — now lists supported formats, explains the optional AI
  backend, shows "No folder selected yet", and provides links to the custom
  model repository and backend setup guide.
- **Non-commercial warning** — the guide reminds users that some bundled models
  are non-commercial.
- **Locale fallback** — missing translation keys now fall back to English
  instead of showing raw key paths.

## Notes

- The main application is otherwise unchanged from v1.2.1.
- The optional AI backend still needs Python 3.10 or 3.11, internet access and
  about 2 GB of disk space.
- Some bundled models are non-commercial; check the model name and the bundled
  notices before commercial use.
