# Install the native HAT/DAT/SUPIR Python backend into native/.venv.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File native/setup.ps1
#   powershell -ExecutionPolicy Bypass -File native/setup.ps1 -Cuda cu124
#
# Requires Python 3.10 or 3.11 (spandrel does not support 3.12 yet).
#
# The CUDA option installs a CUDA-enabled PyTorch build. Without it the CPU
# wheel is installed; SUPIR additionally requires CUDA at runtime.

param(
  [string]$Cuda = ""
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$venv = Join-Path $root ".venv"

function Find-CompatiblePython {
  # spandrel requires Python < 3.12. Try the newest supported launcher first,
  # then fall back to whatever "python" resolves to and validate its version.
  foreach ($launcher in @("py -3.11", "py -3.10", "python")) {
    try {
      $parts = $launcher.Split(" ")
      $exe = $parts[0]
      $versionArgs = @()
      if ($parts.Length -gt 1) { $versionArgs = @($parts[1]) }
      $version = & $exe @versionArgs -c "import sys; print('%d.%d' % sys.version_info[:2])" 2>$null
      if ($LASTEXITCODE -eq 0 -and $version -match "^3\.(10|11)$") {
        return @{ Exe = $exe; Args = $versionArgs }
      }
    } catch {
      continue
    }
  }
  return $null
}

$pythonLauncher = Find-CompatiblePython
if ($null -eq $pythonLauncher) {
  throw "Python 3.10 or 3.11 was not found. spandrel requires Python < 3.12. Install a supported version from https://www.python.org/downloads/"
}

Write-Host "Creating virtual environment in $venv"
& $pythonLauncher.Exe @($pythonLauncher.Args + @("-m", "venv", $venv))

$python = Join-Path $venv "Scripts\python.exe"
if (-not (Test-Path $python)) {
  throw "Virtual environment creation failed. Remove native/.venv and run this script again."
}

& $python -m pip install --upgrade pip

if ($Cuda -ne "") {
  Write-Host "Installing CUDA PyTorch from https://download.pytorch.org/whl/$Cuda"
  & $python -m pip install torch torchvision --index-url "https://download.pytorch.org/whl/$Cuda"
} else {
  Write-Host "Installing CPU PyTorch (pass -Cuda cu124 for NVIDIA GPUs)"
  & $python -m pip install torch torchvision
}

& $python -m pip install -r (Join-Path $root "requirements.txt")

Write-Host "Verifying installation..."
& $python -c "import torch, spandrel, onnxruntime; print('torch', torch.__version__, 'cuda', torch.cuda.is_available()); print('spandrel', spandrel.__version__); print('onnxruntime', onnxruntime.__version__)"

Write-Host ""
Write-Host "Native backend installed. Start Upscayl-Next from source and select a"
Write-Host "HAT/DAT .pth/.safetensors/.onnx model or a SUPIR checkpoint."
Write-Host "For SUPIR, clone https://github.com/Fanghua-Yu/SUPIR and set UPSCAYL_SUPIR_REPO."
