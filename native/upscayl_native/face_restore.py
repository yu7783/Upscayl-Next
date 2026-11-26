"""Optional face restoration post-processor for Upscayl-Next.

Supports GFPGAN (`gfpgan`) and CodeFormer (`facexlib` + `basicsr`) when
installed in the native Python environment. When invoked with `--check`, prints
a JSON readiness report to stdout and exits 0.

Usage:
  python face_restore.py --check
  python face_restore.py --input in.png --output out.png --strength 0.7 --engine auto
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
import sys
from pathlib import Path


def detect_engines() -> list[str]:
    engines: list[str] = []
    if importlib.util.find_spec("gfpgan") is not None:
        engines.append("gfpgan")
    if (
        importlib.util.find_spec("facexlib") is not None
        and importlib.util.find_spec("basicsr") is not None
    ):
        engines.append("codeformer")
    return engines


def _ensure_torchvision_compat() -> None:
    """Provide `torchvision.transforms.functional_tensor` shim for basicsr on torchvision >= 0.18."""
    try:
        import torchvision.transforms.functional_tensor  # type: ignore  # noqa: F401
    except Exception:
        try:
            import types
            import torchvision.transforms.functional as _F

            mod = types.ModuleType("torchvision.transforms.functional_tensor")
            mod.rgb_to_grayscale = _F.rgb_to_grayscale  # type: ignore[attr-defined]
            sys.modules["torchvision.transforms.functional_tensor"] = mod
        except Exception:
            pass


def restore_with_gfpgan(
    input_path: str,
    output_path: str,
    strength: float,
    model_path: str | None,
) -> None:
    _ensure_torchvision_compat()
    import cv2
    import numpy as np
    from gfpgan import GFPGANer

    weight_path = model_path
    if not weight_path:
        default_dir = Path.home() / ".cache" / "upscayl-next" / "gfpgan"
        default_dir.mkdir(parents=True, exist_ok=True)
        weight_path = str(default_dir / "GFPGANv1.4.pth")
        if not os.path.exists(weight_path):
            weight_path = (
                "https://github.com/TencentARC/GFPGAN/releases/download/"
                "v1.3.0/GFPGANv1.4.pth"
            )

    restorer = GFPGANer(
        model_path=weight_path,
        upscale=1,
        arch="clean",
        channel_multiplier=2,
        bg_upsampler=None,
    )

    img = cv2.imread(input_path, cv2.IMREAD_UNCHANGED)
    if img is None:
        raise RuntimeError(f"Could not read image: {input_path}")

    alpha_channel = None
    bgr = img
    if img.ndim == 3 and img.shape[2] == 4:
        alpha_channel = img[:, :, 3]
        bgr = img[:, :, :3]

    _, _, restored = restorer.enhance(
        bgr,
        has_aligned=False,
        only_center_face=False,
        paste_back=True,
        weight=max(0.0, min(1.0, strength)),
    )

    if restored is None:
        restored = bgr
    else:
        w = max(0.0, min(1.0, strength))
        if w < 1.0:
            restored = np.clip(
                bgr.astype(np.float32) * (1.0 - w) + restored.astype(np.float32) * w,
                0,
                255,
            ).astype(np.uint8)

    if alpha_channel is not None:
        restored = cv2.merge(
            [restored[:, :, 0], restored[:, :, 1], restored[:, :, 2], alpha_channel]
        )

    cv2.imwrite(output_path, restored)


def main() -> int:
    parser = argparse.ArgumentParser(description="Upscayl-Next Face Restoration")
    parser.add_argument("--check", action="store_true", help="Print availability JSON")
    parser.add_argument("--input", type=str, help="Input image path")
    parser.add_argument("--output", type=str, help="Output image path")
    parser.add_argument("--strength", type=float, default=0.7, help="Blend weight 0..1")
    parser.add_argument("--engine", type=str, default="auto", choices=["auto", "gfpgan"])
    parser.add_argument("--model-path", type=str, default=None, help="Optional weights path")
    args = parser.parse_args()

    engines = detect_engines()
    if args.check:
        print(
            json.dumps(
                {
                    "available": len(engines) > 0,
                    "engines": engines,
                    "python": sys.executable,
                }
            )
        )
        return 0

    if not args.input or not args.output:
        print("Missing --input or --output", file=sys.stderr)
        return 2

    if "gfpgan" not in engines:
        print(
            "Face restoration backend (gfpgan) is not installed. "
            "Install with: pip install gfpgan opencv-python",
            file=sys.stderr,
        )
        return 3

    try:
        restore_with_gfpgan(args.input, args.output, args.strength, args.model_path)
        return 0
    except Exception as exc:
        print(f"Face restoration failed: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
