"""Native PyTorch/ONNX worker for Upscayl-Next.

The worker deliberately mirrors the CLI of upscayl-bin so the Electron main
process can reuse every existing argument builder (single image, batch,
double upscale and video frames).

Supported model families:
  * HAT  (Hybrid Attention Transformer)  - PyTorch/ONNX via spandrel
  * DAT  (Dual Aggregation Transformer)  - PyTorch/ONNX via spandrel
  * SUPIR (diffusion restoration)        - official SUPIR implementation
  * any other spandrel/ONNX SR model
"""

__version__ = "1.0.0"
