"""PyTorch checkpoint loader for HAT, DAT and other SR architectures.

Spandrel is the same model loader used by chaiNNer. It detects the architecture
and hyperparameters from the checkpoint, so HAT and DAT checkpoints work without
asking the user for architecture flags.
"""

from __future__ import annotations

from dataclasses import dataclass
import os
import sys

import torch


@dataclass
class SpandrelModel:
    model: object
    scale: float
    arch: str
    device: torch.device
    dtype: torch.dtype

    def __call__(self, tensor: torch.Tensor) -> torch.Tensor:
        tensor = tensor.to(device=self.device, dtype=self.dtype)
        with torch.no_grad():
            output = self.model(tensor)
        if isinstance(output, (tuple, list)):
            output = output[0]
        return output.float()


def _select_device(gpu_id: str) -> torch.device:
    value = (gpu_id or "").strip().lower()
    if value in {"cpu", "-1"}:
        return torch.device("cpu")

    # Vulkan device indices do not always match CUDA indices. The override lets
    # users pin the PyTorch device explicitly.
    override = os.environ.get("UPSCAYL_NATIVE_CUDA_DEVICE", "").strip()
    if override:
        value = override.lower()

    if torch.cuda.is_available():
        index = 0
        if value.isdigit():
            index = int(value)
        count = torch.cuda.device_count()
        if index >= count:
            index = 0
        return torch.device(f"cuda:{index}")

    if getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
        return torch.device("mps")

    if value not in {"", "0"}:
        print(
            f"Warning: GPU {gpu_id} was requested but no CUDA/MPS device is available. Using CPU.",
            file=sys.stderr,
            flush=True,
        )
    return torch.device("cpu")


def load_spandrel_model(model_path: str, gpu_id: str = "") -> SpandrelModel:
    try:
        import spandrel
    except ImportError as exc:  # pragma: no cover - depends on user install
        raise RuntimeError(
            "The 'spandrel' package is not installed. Run native/setup.ps1 or "
            "`pip install -r native/requirements.txt`."
        ) from exc

    # Optional extra architectures (restrictive licenses) extend spandrel.
    try:
        import spandrel_extra_arches

        spandrel_extra_arches.install()
    except Exception:
        pass

    from spandrel import ImageModelDescriptor, ModelLoader

    if not os.path.isfile(model_path):
        raise FileNotFoundError(f"Model file not found: {model_path}")

    descriptor = ModelLoader().load_from_file(model_path)
    if not isinstance(descriptor, ImageModelDescriptor):
        raise RuntimeError(
            "This checkpoint is not an image-to-image upscaler. "
            f"Detected model type: {type(descriptor).__name__}"
        )

    device = _select_device(gpu_id)
    descriptor.eval()
    descriptor.to(device)

    dtype = torch.float32
    if device.type == "cuda" and os.environ.get("UPSCAYL_NATIVE_FP16", "").strip() in {
        "1",
        "true",
        "yes",
    }:
        descriptor.half()
        dtype = torch.float16

    arch = getattr(descriptor, "arch", None) or type(descriptor.model).__name__
    scale = float(getattr(descriptor, "scale", 1) or 1)
    return SpandrelModel(descriptor, scale, str(arch), device, dtype)
