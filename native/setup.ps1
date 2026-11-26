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

if ($Cuda -eq "") {
  try {
    & nvidia-smi 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) {
      $Cuda = "cu124"
      Write-Host "NVIDIA GPU detected; selecting CUDA PyTorch ($Cuda)."
    }
  } catch {}
}

if ($Cuda -ne "") {
  Write-Host "Installing CUDA PyTorch from https://download.pytorch.org/whl/$Cuda"
  & $python -m pip install torch torchvision --index-url "https://download.pytorch.org/whl/$Cuda"
} else {
  Write-Host "Installing CPU PyTorch (pass -Cuda cu124 for NVIDIA GPUs)"
  & $python -m pip install torch torchvision
}

& $python -m pip install -r (Join-Path $root "requirements.txt")

$faceReq = Join-Path $root "requirements-face.txt"
if (Test-Path $faceReq) {
  Write-Host "Installing face restoration packages (GFPGAN / OpenCV)..."
  try {
    & $python -m pip install -r $faceReq
  } catch {
    Write-Warning "Face restoration packages (GFPGAN) could not be installed automatically: $_"
  }
}

Write-Host "Pre-downloading GFPGANv1.4 weights (best effort)..."
try {
  $cacheDir = Join-Path $env:USERPROFILE ".cache\upscayl-next\gfpgan"
  New-Item -ItemType Directory -Force -Path $cacheDir | Out-Null
  $weightFile = Join-Path $cacheDir "GFPGANv1.4.pth"
  if (-not (Test-Path $weightFile)) {
    Invoke-WebRequest -Uri "https://github.com/TencentARC/GFPGAN/releases/download/v1.3.0/GFPGANv1.4.pth" -OutFile $weightFile -UseBasicParsing
  }
} catch {
  Write-Warning "Could not pre-download GFPGANv1.4.pth (will download on first use): $_"
}

Write-Host "Verifying installation..."
& $python -c "import torch, spandrel, onnxruntime; print('torch', torch.__version__, 'cuda', torch.cuda.is_available()); print('spandrel', spandrel.__version__); print('onnxruntime', onnxruntime.__version__)"
& $python (Join-Path $root "upscayl_native\face_restore.py") --check

Write-Host ""
Write-Host "Native backend + GFPGAN face restoration installed."
Write-Host "You can now use HAT/DAT/SUPIR models and Face Restoration (GFPGAN) in Upscayl-Next."
