"""ONNX Runtime backend for HAT/DAT and other exported upscalers."""

from __future__ import annotations

from dataclasses import dataclass
import os
import sys

import numpy as np
import torch


@dataclass
class OnnxModel:
    session: object
    input_name: str
    output_name: str
    input_layout: str
    scale: float
    provider: str
    # Fixed input size for graphs exported without dynamic axes. 0 means the
    # graph accepts arbitrary H/W.
    static_height: int = 0
    static_width: int = 0
    # Tile size the worker should use so every tile fits a static input.
    tile_size: int = 0

    def _run(self, array: np.ndarray) -> np.ndarray:
        if self.input_layout == "nhwc":
            array = np.transpose(array, (0, 2, 3, 1))
        outputs = self.session.run([self.output_name], {self.input_name: array})
        output = np.asarray(outputs[0])
        if self.input_layout == "nhwc" and output.ndim == 4:
            output = np.transpose(output, (0, 3, 1, 2))
        return output

    def __call__(self, tensor: torch.Tensor) -> torch.Tensor:
        _, _, height, width = tensor.shape
        padded = tensor

        if self.static_height and self.static_width:
            if height > self.static_height or width > self.static_width:
                raise RuntimeError(
                    "This ONNX graph only accepts "
                    f"{self.static_width}x{self.static_height} inputs but received "
                    f"{width}x{height}. Set a tile size of "
                    f"{self.tile_size or min(self.static_height, self.static_width)} "
                    "in the settings so the image is processed in tiles."
                )
            pad_bottom = self.static_height - height
            pad_right = self.static_width - width
            if pad_bottom or pad_right:
                # Replicate edge pixels so the graph sees a full-size input.
                padded = torch.nn.functional.pad(
                    tensor, (0, pad_right, 0, pad_bottom), mode="replicate"
                )

        output = torch.from_numpy(self._run(padded.detach().float().cpu().numpy())).float()
        if padded is not tensor:
            out_h = max(1, int(round(height * self.scale)))
            out_w = max(1, int(round(width * self.scale)))
            output = output[:, :, :out_h, :out_w]
        return output


def _shape_scale(input_shape: list, output_shape: list) -> float:
    """Infer the upscale factor from static NCHW input/output shapes."""
    try:
        in_h, in_w = int(input_shape[2]), int(input_shape[3])
        out_h, out_w = int(output_shape[2]), int(output_shape[3])
        if in_h > 0 and in_w > 0 and out_h > 0 and out_w > 0:
            return max(out_h / in_h, out_w / in_w)
    except (IndexError, TypeError, ValueError, ZeroDivisionError):
        pass
    return 1.0


def load_onnx_model(
    model_path: str,
    gpu_id: str = "",
    fallback_scale: float = 4.0,
) -> OnnxModel:
    try:
        import onnxruntime as ort
    except ImportError as exc:  # pragma: no cover - depends on user install
        raise RuntimeError(
            "The 'onnxruntime' package is not installed. Run native/setup.ps1 or "
            "`pip install -r native/requirements.txt`."
        ) from exc

    if not os.path.isfile(model_path):
        raise FileNotFoundError(f"Model file not found: {model_path}")

    value = (gpu_id or "").strip().lower()
    providers: list[str] = []
    if value != "cpu":
        available = ort.get_available_providers()
        for provider in (
            "CUDAExecutionProvider",
            "DmlExecutionProvider",
            "CoreMLExecutionProvider",
        ):
            if provider in available:
                providers.append(provider)
                break
    providers.append("CPUExecutionProvider")

    session = ort.InferenceSession(model_path, providers=providers)
    provider = session.get_providers()[0]
    if provider != "CUDAExecutionProvider" and value not in {"", "0", "cpu"}:
        print(
            f"Warning: requested GPU {gpu_id}, but ONNX Runtime is using {provider}.",
            file=sys.stderr,
            flush=True,
        )

    inputs = session.get_inputs()
    outputs = session.get_outputs()
    if not inputs or not outputs:
        raise RuntimeError("The ONNX graph has no inputs or outputs.")

    input_meta = inputs[0]
    input_shape = list(input_meta.shape)
    layout = "nhwc" if len(input_shape) == 4 and input_shape[-1] in (1, 3, 4) else "nchw"
    scale = _shape_scale(input_shape, list(outputs[0].shape)) if layout == "nchw" else 1.0
    if scale <= 1.0:
        scale = float(fallback_scale or 4.0)

    static_height = static_width = 0
    if layout == "nchw" and len(input_shape) == 4:
        height, width = input_shape[2], input_shape[3]
        if isinstance(height, int) and isinstance(width, int) and height > 0 and width > 0:
            static_height, static_width = height, width
            print(
                f"ONNX graph has a fixed {static_width}x{static_height} input; "
                "tiling will be used automatically.",
                file=sys.stderr,
                flush=True,
            )

    return OnnxModel(
        session=session,
        input_name=input_meta.name,
        output_name=outputs[0].name,
        input_layout=layout,
        scale=scale,
        provider=provider,
        static_height=static_height,
        static_width=static_width,
        tile_size=min(static_height, static_width) if static_height else 0,
    )
