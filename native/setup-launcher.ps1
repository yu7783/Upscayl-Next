# Self-elevating launcher for the optional HAT/DAT/SUPIR backend.
# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2024-2026 Upscayl-Next contributors.
#
# This script is installed with the application and is used by the
# "Set up AI backend" Start Menu shortcut. It asks Windows for elevation and
# then runs native/setup.ps1 from the same folder. Keeping the launcher next
# to setup.ps1 means the shortcut keeps working after updates.

$ErrorActionPreference = "Stop"

$scriptPath = Join-Path $PSScriptRoot "setup.ps1"
if (-not (Test-Path -LiteralPath $scriptPath)) {
    Write-Host "Could not find setup.ps1 next to this launcher." -ForegroundColor Red
    Read-Host "Press Enter to close"
    exit 1
}

Write-Host "Upscayl-Next optional AI backend setup" -ForegroundColor Cyan
Write-Host "The next step asks for administrator permission because the"
Write-Host "Python virtual environment is created inside the application folder."
Write-Host ""

try {
    $process = Start-Process -FilePath "powershell.exe" -Verb RunAs -Wait -PassThru -ArgumentList @(
        "-NoProfile",
        "-ExecutionPolicy", "Bypass",
        "-File", $scriptPath
    )

    if ($process.ExitCode -ne 0) {
        Write-Host "The AI backend setup exited with code $($process.ExitCode)." -ForegroundColor Yellow
        Write-Host "Check that Python 3.10 or 3.11 is installed and try again."
    } else {
        Write-Host "The AI backend setup finished successfully." -ForegroundColor Green
    }
} catch {
    Write-Host "The AI backend setup could not be started: $($_.Exception.Message)" -ForegroundColor Yellow
}

Read-Host "Press Enter to close"
