"""Image loading, tiled inference, TTA and saving helpers."""

from __future__ import annotations

import math
import os
from typing import Callable, Iterable

import numpy as np
import torch
from PIL import Image

SUPPORTED_INPUT_EXTENSIONS = {
    ".png",
    ".jpg",
    ".jpeg",
    ".webp",
    ".bmp",
    ".tif",
    ".tiff",
}

ProcessFn = Callable[[torch.Tensor], torch.Tensor]


def pil_to_tensor(image: Image.Image) -> torch.Tensor:
    """Convert a PIL image to a float32 NCHW tensor in the 0..1 range."""
    array = np.asarray(image.convert("RGB"), dtype=np.float32) / 255.0
    tensor = torch.from_numpy(array).permute(2, 0, 1).unsqueeze(0)
    return tensor.contiguous()


def tensor_to_pil(tensor: torch.Tensor) -> Image.Image:
    """Convert a float32 NCHW tensor to an RGB PIL image."""
    tensor = tensor.detach().float().clamp(0.0, 1.0).cpu()
    if tensor.dim() == 4:
        tensor = tensor[0]
    if tensor.shape[0] == 1:
        tensor = tensor.repeat(3, 1, 1)
    array = tensor.permute(1, 2, 0).numpy()
    array = np.rint(array * 255.0).astype(np.uint8)
    return Image.fromarray(array, mode="RGB")


def load_image(path: str) -> tuple[Image.Image, Image.Image | None]:
    """Load an image and keep its alpha channel separate when present."""
    with Image.open(path) as opened:
        opened.load()
        has_alpha = "A" in opened.getbands()
        image = opened.convert("RGBA") if has_alpha else opened.convert("RGB")
    if image.mode == "RGBA":
        alpha = image.getchannel("A")
        rgb = image.convert("RGB")
        return rgb, alpha
    return image.convert("RGB"), None


def merge_alpha(rgb: Image.Image, alpha: Image.Image | None) -> Image.Image:
    if alpha is None:
        return rgb.convert("RGB")
    resized_alpha = alpha.resize(rgb.size, Image.Resampling.LANCZOS)
    rgba = rgb.convert("RGBA")
    rgba.putalpha(resized_alpha)
    return rgba


def _window(length: int, ramp: int) -> np.ndarray:
    """1D feathering window used to blend overlapping tiles."""
    weights = np.ones(length, dtype=np.float32)
    ramp = max(0, min(ramp, length // 2))
    if ramp > 0:
        rising = np.linspace(0.0, 1.0, ramp, dtype=np.float32)
        weights[:ramp] = rising
        weights[-ramp:] = rising[::-1]
    return weights


def _apply_tta(process_fn: ProcessFn, tensor: torch.Tensor) -> torch.Tensor:
    """Average the 8 dihedral transforms (flips + 90 degree rotations)."""
    total: torch.Tensor | None = None
    count = 0
    for rotations in range(4):
        rotated = torch.rot90(tensor, rotations, dims=(2, 3))
        for flip in (False, True):
            variant = torch.flip(rotated, dims=(3,)) if flip else rotated
            result = process_fn(variant)
            if flip:
                result = torch.flip(result, dims=(3,))
            if rotations:
                result = torch.rot90(result, -rotations, dims=(2, 3))
            total = result if total is None else total + result
            count += 1
    assert total is not None
    return total / count


def _process_tile(
    tile: torch.Tensor,
    process_fn: ProcessFn,
    tta: bool,
) -> torch.Tensor:
    if tta:
        return _apply_tta(process_fn, tile)
    return process_fn(tile)


def _tile_positions(length: int, tile: int, overlap: int) -> list[int]:
    if tile >= length:
        return [0]
    stride = max(1, tile - overlap)
    positions = list(range(0, length - tile + 1, stride))
    if positions[-1] != length - tile:
        positions.append(length - tile)
    return positions


def run_tiled(
    tensor: torch.Tensor,
    process_fn: ProcessFn,
    scale: float,
    tile_size: int = 0,
    tta: bool = False,
    progress_cb: Callable[[float], None] | None = None,
) -> torch.Tensor:
    """Run `process_fn` over an image, splitting it into overlapping tiles.

    `tile_size` is expressed in input pixels and matches upscayl-bin's `-t`.
    0 (or a tile bigger than the image) runs the model in a single pass.
    """
    scale = max(1.0, float(scale))
    _, _, height, width = tensor.shape
    out_height = max(1, int(round(height * scale)))
    out_width = max(1, int(round(width * scale)))

    tile = int(tile_size or 0)
    if tile > 0:
        # Transformer windows need a size that can be split into windows.
        tile = max(16, (tile // 16) * 16)
    if tile <= 0 or (tile >= height and tile >= width):
        if progress_cb:
            progress_cb(5.0)
        output = _process_tile(tensor, process_fn, tta)
        if progress_cb:
            progress_cb(95.0)
        return output

    overlap = max(8, min(32, tile // 8))
    ys = _tile_positions(height, tile, overlap)
    xs = _tile_positions(width, tile, overlap)
    total_tiles = len(ys) * len(xs)

    output = torch.zeros((1, 3, out_height, out_width), dtype=torch.float32)
    weights = torch.zeros((1, 1, out_height, out_width), dtype=torch.float32)
    done = 0

    for y in ys:
        for x in xs:
            tile_height = min(tile, height - y)
            tile_width = min(tile, width - x)
            tile_tensor = tensor[:, :, y : y + tile_height, x : x + tile_width]
            tile_output = _process_tile(tile_tensor, process_fn, tta)

            target_h = max(1, int(round(tile_height * scale)))
            target_w = max(1, int(round(tile_width * scale)))
            if tile_output.shape[-2:] != (target_h, target_w):
                tile_output = torch.nn.functional.interpolate(
                    tile_output,
                    size=(target_h, target_w),
                    mode="bilinear",
                    align_corners=False,
                )

            mask_1d_y = _window(target_h, overlap * int(round(scale)))
            mask_1d_x = _window(target_w, overlap * int(round(scale)))
            mask = torch.from_numpy(np.outer(mask_1d_y, mask_1d_x))[None, None, :, :]

            oy = int(round(y * scale))
            ox = int(round(x * scale))
            output[:, :, oy : oy + target_h, ox : ox + target_w] += (
                tile_output.detach().float().cpu() * mask
            )
            weights[:, :, oy : oy + target_h, ox : ox + target_w] += mask

            done += 1
            if progress_cb:
                progress_cb(5.0 + 90.0 * (done / total_tiles))

    return output / weights.clamp_min(1e-8)


def resize_to_scale(
    image: Image.Image, original_size: tuple[int, int], scale: float
) -> Image.Image:
    target = (
        max(1, int(round(original_size[0] * scale))),
        max(1, int(round(original_size[1] * scale))),
    )
    if image.size == target:
        return image
    return image.resize(target, Image.Resampling.LANCZOS)


def resize_to_width(image: Image.Image, width: int) -> Image.Image:
    if width <= 0 or image.width == width:
        return image
    height = max(1, int(round(image.height * (width / image.width))))
    return image.resize((width, height), Image.Resampling.LANCZOS)


def save_image(
    image: Image.Image,
    output_path: str,
    image_format: str,
    compression: int = 0,
) -> None:
    """Save using the same compression semantics as the Upscayl settings slider."""
    os.makedirs(os.path.dirname(os.path.abspath(output_path)) or ".", exist_ok=True)
    extension = image_format.lower().lstrip(".")
    if extension == "jpeg":
        extension = "jpg"

    compression = max(0, min(100, int(compression or 0)))
    if extension in {"jpg", "webp"}:
        quality = max(1, 100 - compression)
        if extension == "jpg":
            image.convert("RGB").save(output_path, format="JPEG", quality=quality)
        else:
            image.save(output_path, format="WEBP", quality=quality)
        return

    if extension == "png":
        compress_level = max(0, min(9, int(round(compression / 100 * 9))))
        image.save(output_path, format="PNG", compress_level=compress_level)
        return

    image.save(output_path)


def iter_images(input_path: str) -> Iterable[str]:
    if not os.path.isdir(input_path):
        yield input_path
        return

    for name in sorted(os.listdir(input_path)):
        full_path = os.path.join(input_path, name)
        if not os.path.isfile(full_path):
            continue
        if os.path.splitext(name)[1].lower() in SUPPORTED_INPUT_EXTENSIONS:
            yield full_path


def build_batch_output_path(
    input_path: str, output_dir: str, image_format: str
) -> str:
    stem = os.path.splitext(os.path.basename(input_path))[0]
    extension = image_format.lower().lstrip(".") or "png"
    if extension == "jpeg":
        extension = "jpg"
    return os.path.join(output_dir, f"{stem}.{extension}")


def calculate_passes(
    model_scale: float, requested_scale: float | None
) -> tuple[int, float]:
    """Return how many model passes to run and the final requested scale."""
    model_scale = max(1.0, float(model_scale or 1.0))
    if requested_scale is None or requested_scale <= 0:
        return 1, model_scale

    if requested_scale <= model_scale:
        return 1, float(requested_scale)

    passes = 0
    reached = 1.0
    while reached < requested_scale - 1e-6 and passes < 8:
        reached *= model_scale
        passes += 1
    return max(1, passes), float(requested_scale)


def estimate_size(scale: float, width: int, height: int) -> tuple[int, int]:
    return (
        max(1, int(math.ceil(width * scale))),
        max(1, int(math.ceil(height * scale))),
    )
