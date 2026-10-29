#!/usr/bin/env bash
# Install the native HAT/DAT/SUPIR Python backend into native/.venv.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV="$ROOT/.venv"
PYTHON_BIN="${PYTHON_BIN:-python3}"

# spandrel requires Python < 3.12.
VERSION="$("$PYTHON_BIN" -c 'import sys; print("%d.%d" % sys.version_info[:2])')"
if [[ ! "$VERSION" =~ ^3\.(10|11)$ ]]; then
  echo "Python 3.10 or 3.11 is required (found $VERSION)." >&2
  echo "Set PYTHON_BIN to a supported interpreter, e.g. PYTHON_BIN=python3.11 ./native/setup.sh" >&2
  exit 1
fi

"$PYTHON_BIN" -m venv "$VENV"
"$VENV/bin/python" -m pip install --upgrade pip

if [[ "${1:-}" == "--cuda" ]]; then
  INDEX="${2:-cu124}"
  "$VENV/bin/python" -m pip install torch torchvision \
    --index-url "https://download.pytorch.org/whl/$INDEX"
else
  "$VENV/bin/python" -m pip install torch torchvision
fi

"$VENV/bin/python" -m pip install -r "$ROOT/requirements.txt"
"$VENV/bin/python" -c "import torch, spandrel, onnxruntime; print('torch', torch.__version__, 'cuda', torch.cuda.is_available()); print('spandrel', spandrel.__version__); print('onnxruntime', onnxruntime.__version__)"

echo "Native backend installed. See native/README.md for SUPIR setup."
