"""SUPIR (Super-Scale Image Restoration) adapter.

SUPIR is a diffusion-based restorer built on SDXL. It cannot be expressed as a
plain image-to-image network, so this module integrates the official SUPIR
implementation instead of re-implementing its pipeline.

Setup:
  1. Clone https://github.com/Fanghua-Yu/SUPIR next to this project (or set
     UPSCAYL_SUPIR_REPO to its path).
  2. Download SDXL + SUPIR-v0Q/v0F as described in that repository.
  3. Point UPSCAYL_SUPIR_SDXL_CKPT / UPSCAYL_SUPIR_CKPT_Q to the files, or edit
     options/SUPIR_v0.yaml.
"""

from __future__ import annotations

import os
import re
import sys
import tempfile
from dataclasses import dataclass

from PIL import Image

DEFAULT_PROMPT = (
    "Cinematic, High Contrast, highly detailed, taken using a Canon EOS R "
    "camera, hyper detailed photo - realistic maximum detail, 32k, Color "
    "Grading, ultra HD, extreme meticulous detailing, skin pore detailing, "
    "hyper sharpness, perfect without deformations."
)
DEFAULT_NEGATIVE_PROMPT = (
    "painting, oil painting, illustration, drawing, art, sketch, oil painting, "
    "cartoon, CG Style, 3D render, unreal engine, blurring, dirty, messy, worst "
    "quality, low quality, frames, watermark, signature, jpeg artifacts, "
    "deformed, lowres, over-smooth"
)


@dataclass
class SupirResult:
    image: Image.Image
    repo_path: str
    options_path: str


def _find_repo(model_path: str) -> str:
    candidates: list[str] = []
    explicit = os.environ.get("UPSCAYL_SUPIR_REPO", "").strip()
    if explicit:
        candidates.append(explicit)

    current = os.path.abspath(os.path.dirname(model_path))
    for _ in range(6):
        candidates.append(current)
        candidates.append(os.path.join(current, "SUPIR"))
        parent = os.path.dirname(current)
        if parent == current:
            break
        current = parent

    candidates.append(os.path.join(os.getcwd(), "SUPIR"))
    candidates.append(os.getcwd())

    # The upstream repository moved from SUPIR/util/__init__.py to a single
    # SUPIR/util.py module, so accept both layouts.
    repo_markers = (
        os.path.join("SUPIR", "util.py"),
        os.path.join("SUPIR", "util", "__init__.py"),
        os.path.join("SUPIR", "__init__.py"),
    )
    for candidate in candidates:
        if candidate and any(
            os.path.isfile(os.path.join(candidate, marker)) for marker in repo_markers
        ):
            return os.path.abspath(candidate)

    raise RuntimeError(
        "SUPIR repository not found. Clone https://github.com/Fanghua-Yu/SUPIR "
        "and set UPSCAYL_SUPIR_REPO to its folder. See native/README.md."
    )


def _patch_options(
    options_path: str, model_path: str, sign: str
) -> str:
    """Point the SUPIR YAML at the selected checkpoint / SDXL file."""
    with open(options_path, "r", encoding="utf-8") as handle:
        content = handle.read()

    replacements: dict[str, str] = {}
    if os.path.splitext(model_path)[1].lower() in {
        ".ckpt",
        ".safetensors",
        ".pth",
        ".pt",
    }:
        replacements["SUPIR_CKPT_F" if sign == "F" else "SUPIR_CKPT_Q"] = model_path

    sdxl = os.environ.get("UPSCAYL_SUPIR_SDXL_CKPT", "").strip()
    if sdxl:
        replacements["SDXL_CKPT"] = sdxl

    if not replacements:
        return options_path

    for key, value in replacements.items():
        pattern = re.compile(rf"^(\s*{re.escape(key)}\s*:).*$", re.MULTILINE)
        content = pattern.sub(lambda match: f"{match.group(1)} {value}", content)

    handle = tempfile.NamedTemporaryFile(
        "w", suffix=".yaml", prefix="upscayl-supir-", delete=False, encoding="utf-8"
    )
    with handle:
        handle.write(content)
    return handle.name

def _convert_dtype(name: str):
    import torch

    return {
        "fp32": torch.float32,
        "fp16": torch.float16,
        "bf16": torch.bfloat16,
    }.get(name.lower(), torch.float16)


def run_supir(
    image: Image.Image,
    model_path: str,
    model_name: str,
    scale: float,
    tile_size: int = 0,
) -> SupirResult:
    import torch

    if not torch.cuda.is_available():
        raise RuntimeError(
            "SUPIR requires CUDA. Install a CUDA-enabled PyTorch build or run "
            "SUPIR on a machine with an NVIDIA GPU."
        )

    repo = _find_repo(model_path)
    if repo not in sys.path:
        sys.path.insert(0, repo)
    os.chdir(repo)

    options_env = os.environ.get("UPSCAYL_SUPIR_OPTIONS", "").strip()
    options_path = options_env or os.path.join(repo, "options", "SUPIR_v0.yaml")
    if model_name.lower().endswith((".yaml", ".yml")) and os.path.isfile(model_path):
        options_path = model_path
    if not os.path.isfile(options_path):
        raise FileNotFoundError(f"SUPIR options file not found: {options_path}")

    sign = "F" if "v0f" in f"{model_name} {model_path}".lower() else "Q"
    patched_options = _patch_options(
        options_path, os.path.abspath(model_path), sign
    )

    from SUPIR.util import PIL2Tensor, Tensor2PIL, create_SUPIR_model

    use_llava = os.environ.get("UPSCAYL_SUPIR_USE_LLAVA", "").strip() in {
        "1",
        "true",
        "yes",
    }
    llava_agent = None
    if use_llava:
        from CKPT_PTH import LLAVA_MODEL_PATH
        from llava.llava_agent import LLavaAgent

        llava_agent = LLavaAgent(
            LLAVA_MODEL_PATH, device="cuda:0", load_8bit=False, load_4bit=False
        )

    print(f"Loading SUPIR ({sign}) from {model_path}", file=sys.stderr, flush=True)
    model = create_SUPIR_model(patched_options, SUPIR_sign=sign)
    model.ae_dtype = _convert_dtype(
        os.environ.get("UPSCAYL_SUPIR_AE_DTYPE", "bf16")
    )
    model.model.dtype = _convert_dtype(
        os.environ.get("UPSCAYL_SUPIR_DIFF_DTYPE", "fp16")
    )
    if tile_size and tile_size > 0:
        model.init_tile_vae(
            encoder_tile_size=int(os.environ.get("UPSCAYL_SUPIR_ENCODER_TILE", "512")),
            decoder_tile_size=int(os.environ.get("UPSCAYL_SUPIR_DECODER_TILE", "64")),
        )
    model = model.to("cuda:0")

    upscale = max(1, min(4, int(round(scale or 4))))
    min_size = int(os.environ.get("UPSCAYL_SUPIR_MIN_SIZE", "1024"))
    edm_steps = int(os.environ.get("UPSCAYL_SUPIR_EDM_STEPS", "50"))
    seed = int(os.environ.get("UPSCAYL_SUPIR_SEED", "1234"))
    color_fix = os.environ.get("UPSCAYL_SUPIR_COLOR_FIX", "Wavelet")

    rgb = image.convert("RGB")
    low_quality, height, width = PIL2Tensor(
        rgb, upsacle=upscale, min_size=min_size
    )
    low_quality = low_quality.unsqueeze(0).to("cuda:0")[:, :3, :, :]

    pre_denoise, h1, w1 = PIL2Tensor(
        rgb, upsacle=upscale, min_size=min_size, fix_resize=512
    )
    pre_denoise = pre_denoise.unsqueeze(0).to("cuda:0")[:, :3, :, :]
    clean_images = model.batchify_denoise(pre_denoise)
    clean_pil = Tensor2PIL(clean_images[0], h1, w1)

    if llava_agent is not None:
        captions = llava_agent.gen_image_caption([clean_pil])
    else:
        captions = [""]

    print("Running SUPIR diffusion...", file=sys.stderr, flush=True)
    samples = model.batchify_sample(
        low_quality,
        captions,
        num_steps=edm_steps,
        restoration_scale=float(os.environ.get("UPSCAYL_SUPIR_S_STAGE1", "-1")),
        s_churn=float(os.environ.get("UPSCAYL_SUPIR_S_CHURN", "5")),
        s_noise=float(os.environ.get("UPSCAYL_SUPIR_S_NOISE", "1.01")),
        cfg_scale=float(os.environ.get("UPSCAYL_SUPIR_CFG", "4.0")),
        control_scale=float(os.environ.get("UPSCAYL_SUPIR_S_STAGE2", "1.0")),
        seed=seed,
        num_samples=1,
        p_p=os.environ.get("UPSCAYL_SUPIR_POSITIVE_PROMPT", DEFAULT_PROMPT),
        n_p=os.environ.get("UPSCAYL_SUPIR_NEGATIVE_PROMPT", DEFAULT_NEGATIVE_PROMPT),
        color_fix_type=color_fix,
        use_linear_CFG=True,
        use_linear_control_scale=False,
        cfg_scale_start=float(os.environ.get("UPSCAYL_SUPIR_LINEAR_CFG", "1.0")),
        control_scale_start=float(
            os.environ.get("UPSCAYL_SUPIR_LINEAR_STAGE2", "0.0")
        ),
    )

    result = Tensor2PIL(samples[0], height, width)
    del model
    torch.cuda.empty_cache()
    return SupirResult(image=result, repo_path=repo, options_path=options_path)
