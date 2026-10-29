"""CLI entry point for the native HAT/DAT/SUPIR worker.

The argument names intentionally mirror upscayl-bin so the Electron main process
can pass the exact same argument arrays to either engine:

  -i input file/folder      -o output file/folder
  -s scale                  -m models folder
  -n model name             -g GPU id
  -f output format          -w custom width
  -c compression            -t tile size
  -x TTA                    -j load:process:save thread split

Numeric stderr lines are treated as progress percentages and lines containing
"Successful" are counted by the batch/video pipelines.
"""

from __future__ import annotations

import argparse
import os
import sys
import traceback

import torch
from PIL import Image

import console
from image_ops import (
    build_batch_output_path,
    calculate_passes,
    iter_images,
    load_image,
    merge_alpha,
    pil_to_tensor,
    resize_to_scale,
    resize_to_width,
    run_tiled,
    save_image,
    tensor_to_pil,
)
from model_paths import detect_family, guess_scale_from_name, resolve_model_path
from onnx_backend import load_onnx_model
from spandrel_backend import load_spandrel_model
from supir_backend import run_supir


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="upscayl-native",
        description="Native HAT / DAT / SUPIR worker for Upscayl-Next",
    )
    parser.add_argument("-i", "--input", required=True)
    parser.add_argument("-o", "--output", required=True)
    parser.add_argument("-s", "--scale", default="")
    parser.add_argument("-m", "--models-path", default="")
    parser.add_argument("-n", "--model", required=True)
    parser.add_argument("-g", "--gpu-id", default="")
    parser.add_argument("-f", "--format", default="png")
    parser.add_argument("-w", "--width", default="")
    parser.add_argument("-c", "--compression", default="0")
    parser.add_argument("-t", "--tile-size", type=int, default=0)
    parser.add_argument("-x", "--tta", action="store_true")
    parser.add_argument("-j", "--threads", default="")
    return parser


def _set_threads(threads: str) -> None:
    if not threads:
        return
    try:
        process_threads = int(threads.split(":")[1])
        if process_threads > 0:
            torch.set_num_threads(process_threads)
    except (ValueError, IndexError):
        pass


def _requested_scale(value: str) -> float | None:
    try:
        parsed = float(str(value).strip())
        return parsed if parsed > 0 else None
    except (TypeError, ValueError):
        return None


def _resolve_output_paths(input_path: str, output_path: str, image_format: str) -> str:
    if os.path.isdir(input_path):
        os.makedirs(output_path, exist_ok=True)
        return output_path
    if os.path.isdir(output_path):
        return build_batch_output_path(input_path, output_path, image_format)
    parent = os.path.dirname(os.path.abspath(output_path))
    if parent:
        os.makedirs(parent, exist_ok=True)
    return output_path


def _run_single(
    rgb: Image.Image,
    alpha: Image.Image | None,
    process_fn,
    model_scale: float,
    requested: float | None,
    width: int,
    tile_size: int,
    tta: bool,
    base: float,
    span: float,
) -> Image.Image:
    passes, final_scale = calculate_passes(model_scale, requested)
    current = rgb
    for pass_index in range(passes):
        def tile_progress(value: float, pass_index: int = pass_index) -> None:
            local = ((pass_index + value / 100.0) / passes) * 100.0
            console.progress(base + span * (local / 100.0))

        tensor = pil_to_tensor(current)
        output = run_tiled(
            tensor,
            process_fn,
            model_scale,
            tile_size=tile_size,
            tta=tta,
            progress_cb=tile_progress,
        )
        current = tensor_to_pil(output)

    result = resize_to_scale(current, rgb.size, final_scale)
    if width > 0:
        console.info("Resizing")
        result = resize_to_width(result, width)
    return merge_alpha(result, alpha)


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    _set_threads(args.threads)

    image_format = (args.format or "png").lower().lstrip(".")
    compression = int(args.compression or 0)
    requested = _requested_scale(args.scale)
    width = int(args.width) if str(args.width).strip().isdigit() else 0
    input_path = os.path.abspath(args.input)
    output_path = os.path.abspath(args.output)

    if not os.path.exists(input_path):
        console.error(f"Input path does not exist: {input_path}")
        return 1

    try:
        model_path = resolve_model_path(args.models_path, args.model)
    except FileNotFoundError as exc:
        console.error(str(exc))
        return 1

    family = detect_family(args.model, model_path)
    files = list(iter_images(input_path))
    if not files:
        console.error(f"No supported images found in: {input_path}")
        return 1

    destination = _resolve_output_paths(input_path, output_path, image_format)
    console.info(
        f"Native engine: {family.upper() if family != 'generic' else 'PyTorch/ONNX'}"
    )
    console.info(f"Model: {model_path}")

    # SUPIR has its own diffusion pipeline and does not expose a plain
    # image-to-image callable.
    if family == "supir":
        total = len(files)
        for index, file_path in enumerate(files, start=1):
            base = ((index - 1) / total) * 100.0
            span = (1.0 / total) * 100.0
            rgb, alpha = load_image(file_path)
            console.progress(base + 2.0)
            result = run_supir(
                rgb,
                model_path,
                args.model,
                requested or guess_scale_from_name(args.model),
                tile_size=args.tile_size,
            )
            image = merge_alpha(result.image, alpha)
            if width > 0:
                image = resize_to_width(image, width)
            target = _resolve_output_paths(file_path, destination, image_format)
            save_image(image, target, image_format, compression)
            console.progress(base + span)
            console.successful(index, total)
        return 0

    # HAT, DAT and generic checkpoints/graphs.
    try:
        if model_path.lower().endswith(".onnx"):
            process_fn = load_onnx_model(
                model_path,
                args.gpu_id,
                fallback_scale=guess_scale_from_name(args.model),
            )
        else:
            process_fn = load_spandrel_model(model_path, args.gpu_id)
    except Exception as exc:
        console.error(str(exc))
        traceback.print_exc(file=sys.stderr)
        return 1

    model_scale = float(getattr(process_fn, "scale", guess_scale_from_name(args.model)))
    console.info(f"Architecture: {getattr(process_fn, 'arch', family)} (x{model_scale:g})")

    # ONNX graphs exported with a fixed input size expose the tile size they
    # need; use it when the user left the tile size on automatic.
    effective_tile_size = args.tile_size or int(getattr(process_fn, "tile_size", 0) or 0)
    if effective_tile_size and not args.tile_size:
        console.info(f"Fixed-size model: using tile size {effective_tile_size}px")

    total = len(files)
    try:
        for index, file_path in enumerate(files, start=1):
            base = ((index - 1) / total) * 100.0
            span = (1.0 / total) * 100.0
            rgb, alpha = load_image(file_path)
            image = _run_single(
                rgb,
                alpha,
                process_fn,
                model_scale,
                requested,
                width,
                effective_tile_size,
                args.tta,
                base,
                span,
            )
            target = _resolve_output_paths(file_path, destination, image_format)
            save_image(image, target, image_format, compression)
            console.progress(base + span)
            console.successful(index, total)
    except Exception as exc:
        console.error(str(exc))
        traceback.print_exc(file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())

