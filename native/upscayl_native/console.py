"""Console helpers.

All worker output goes to stderr because the Electron commands read stderr for
progress and errors. Numeric lines are interpreted as a 0-100 percentage by the
single-image and double-upscale pipelines. Lines containing "Successful" are
counted by the batch and video pipelines.
"""

from __future__ import annotations

import sys


def info(message: str) -> None:
    print(message, file=sys.stderr, flush=True)


def progress(value: float) -> None:
    clamped = max(0.0, min(100.0, float(value)))
    print(f"{clamped:.2f}", file=sys.stderr, flush=True)


def successful(index: int, total: int) -> None:
    info(f"Successful {index}/{total}")


def error(message: str) -> None:
    # The Electron commands look for "Error" / "failed" in stderr.
    info(f"Error: {message}")


def warning(message: str) -> None:
    info(f"Warning: {message}")
