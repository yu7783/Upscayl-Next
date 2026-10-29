"""Model file discovery and architecture detection."""

from __future__ import annotations

import os
import re

EXTERNAL_EXTENSIONS = (".safetensors", ".pth", ".pt", ".ckpt", ".onnx")
CONFIG_EXTENSIONS = (".yaml", ".yml")

# File-name candidates when the user selected a model without an extension.
CANDIDATE_EXTENSIONS = (
    ".safetensors",
    ".pth",
    ".pt",
    ".ckpt",
    ".onnx",
    ".yaml",
    ".yml",
)


def resolve_model_path(models_dir: str, model: str) -> str:
    """Find the actual checkpoint/graph file for a model name."""
    candidates: list[str] = []
    lower = model.lower()
    if lower.endswith(EXTERNAL_EXTENSIONS + CONFIG_EXTENSIONS):
        candidates.append(model)
    else:
        candidates.append(model)
        candidates.extend(model + extension for extension in CANDIDATE_EXTENSIONS)

    for candidate in candidates:
        path = candidate
        if models_dir and not os.path.isabs(candidate):
            path = os.path.join(models_dir, candidate)
        if os.path.isfile(path):
            return os.path.abspath(path)

    searched = ", ".join(
        os.path.join(models_dir, candidate) if models_dir else candidate
        for candidate in candidates
    )
    raise FileNotFoundError(
        f"Model file not found. Looked for: {searched}"
    )


def _has_token(value: str, token: str) -> bool:
    return re.search(rf"(^|[^a-z0-9]){re.escape(token)}([^a-z0-9]|$)", value) is not None


def guess_scale_from_name(model_name: str, default: float = 4.0) -> float:
    """Read 2x/3x/4x from names like "4x-HAT" or "DAT-x2"."""
    match = re.search(r"(?<!\d)([234])\s*x|x\s*([234])(?!\d)", model_name, re.IGNORECASE)
    if match:
        value = match.group(1) or match.group(2)
        try:
            return float(value)
        except (TypeError, ValueError):
            pass
    return float(default)


def detect_family(model_name: str, model_path: str) -> str:
    """Return "supir", "hat", "dat" or "generic"."""
    value = f"{model_name} {os.path.basename(model_path)}".lower()

    if "supir" in value:
        return "supir"
    if _has_token(value, "hat") or "hybridattention" in value or "hybrid attention" in value:
        return "hat"
    if "nomos8kdat" in value or _has_token(value, "dat") or _has_token(value, "dat2"):
        return "dat"
    if "dual aggregation" in value or "dualaggregation" in value:
        return "dat"
    return "generic"
