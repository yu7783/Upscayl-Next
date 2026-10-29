"""Create tiny random HAT/DAT checkpoints for smoke-testing the worker.

This is a developer helper only; it is not used by the application. Run it from
the native/ folder:

    python make_test_checkpoint.py --arch hat --output /tmp/models/4x-HAT.pth
"""

from __future__ import annotations

import argparse
import os

import torch


def build_hat(upscale: int):
    from spandrel.architectures.HAT import HAT

    return HAT(
        img_size=64,
        patch_size=1,
        in_chans=3,
        embed_dim=32,
        depths=(2, 2, 2, 2),
        num_heads=(2, 2, 2, 2),
        window_size=8,
        compress_ratio=3,
        squeeze_factor=30,
        upscale=upscale,
    )


def build_dat(upscale: int):
    from spandrel.architectures.DAT import DAT

    return DAT(
        img_size=64,
        in_chans=3,
        embed_dim=32,
        split_size=[2, 4],
        depth=[2, 2, 2, 2],
        num_heads=[2, 2, 2, 2],
        expansion_factor=2.0,
        upscale=upscale,
    )


BUILDERS = {"hat": build_hat, "dat": build_dat}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--arch", choices=sorted(BUILDERS), default="hat")
    parser.add_argument("--scale", type=int, default=4)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    model = BUILDERS[args.arch](args.scale).eval()
    os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
    torch.save({"params": model.state_dict()}, args.output)
    print(f"Saved random {args.arch.upper()} x{args.scale} checkpoint to {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
