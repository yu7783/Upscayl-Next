# Generates animated artwork for the Upscayl-Next NSIS installer.
# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2024-2026 Upscayl-Next contributors.
#
# Every pixel here is derived from build/icon.png and generated gradients.
# No third-party icons, photos, music or video clips are embedded.
# The credits page text lists upstream projects and their licenses.
#
# Usage (from the upscayl folder):
#   pwsh -NoProfile -File scripts/generate-installer-assets.ps1
#
# Requires Windows PowerShell/PowerShell 7 with System.Drawing, and ffmpeg
# on PATH to turn the generated BMP frames into AVI animations. If ffmpeg is
# missing the script keeps any existing AVI files and prints a warning.

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$iconPath = Join-Path $root "build\icon.png"
$outDir = Join-Path $root "build\anim"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$icon = [System.Drawing.Image]::FromFile($iconPath)
$ffmpeg = (Get-Command ffmpeg -ErrorAction SilentlyContinue).Source

function New-Canvas {
    param(
        [int]$Width,
        [int]$Height,
        [double]$Phase,
        [double]$HueShift = 0
    )
    $bmp = New-Object System.Drawing.Bitmap($Width, $Height, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

    $r1 = 16 + [int](12 * [Math]::Sin($Phase))
    $g1 = 12 + [int](8 * [Math]::Cos($Phase * 0.7))
    $b1 = 42 + [int](18 * [Math]::Sin($Phase + 1.2))
    $r2 = 54 + [int](22 * [Math]::Cos($Phase + 0.4 + $HueShift))
    $g2 = 22 + [int](10 * [Math]::Sin($Phase * 1.3))
    $b2 = 128 + [int](34 * [Math]::Sin($Phase + 2.1 + $HueShift))

    $c1 = [System.Drawing.Color]::FromArgb(255, $r1, $g1, $b1)
    $c2 = [System.Drawing.Color]::FromArgb(255, $r2, $g2, $b2)
    $rect = New-Object System.Drawing.Rectangle(0, 0, $Width, $Height)
    $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, $c1, $c2, 35)
    $g.FillRectangle($brush, $rect)
    $brush.Dispose()

    # Subtle diagonal glass lines keep the dark background from looking flat.
    $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(18, 255, 255, 255), 1)
    for ($x = -$Height; $x -lt $Width; $x += 18) {
        $g.DrawLine($pen, $x, 0, $x + $Height, $Height)
    }
    $pen.Dispose()

    return @{ Bitmap = $bmp; Graphics = $g }
}

# ---------------------------------------------------------------------------
# Welcome animation: 280x80, 20 frames at 12 fps.
# ---------------------------------------------------------------------------
$wW = 280
$wH = 80
$wFrames = 20
for ($i = 0; $i -lt $wFrames; $i++) {
    $phase = ($i / $wFrames) * [Math]::PI * 2
    $c = New-Canvas -Width $wW -Height $wH -Phase $phase
    $g = $c.Graphics

    $glowSize = 58 + [int](8 * [Math]::Sin($phase))
    $glowBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(70, 124, 58, 237))
    $g.FillEllipse($glowBrush, 12, [int](($wH - $glowSize) / 2), $glowSize, $glowSize)
    $glowBrush.Dispose()

    $logo = 38 + [int](3 * [Math]::Cos($phase))
    $cx = 16 + $logo / 2
    $cy = $wH / 2
    $state = $g.Save()
    $g.TranslateTransform($cx, $cy)
    $g.RotateTransform([float](4 * [Math]::Sin($phase)))
    $g.DrawImage($icon, -$logo / 2, -$logo / 2, $logo, $logo)
    $g.Restore($state)

    $titleFont = New-Object System.Drawing.Font("Segoe UI", 15, [System.Drawing.FontStyle]::Bold)
    $subFont = New-Object System.Drawing.Font("Segoe UI", 7.5)
    $white = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
    $soft = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(230, 226, 220, 255))
    $g.DrawString("UPSCAYL", $titleFont, $white, 62, 10)
    $g.DrawString("N E X T", $titleFont, $soft, 148, 10)
    $g.DrawString("AI IMAGE UPSCALER", $subFont, $soft, 64, 36)

    $sweepX = [int]((($phase / ([Math]::PI * 2)) * ($wW + 140)) - 140)
    $sweepRect = New-Object System.Drawing.Rectangle($sweepX, 0, 110, $wH)
    $sweep = New-Object System.Drawing.Drawing2D.LinearGradientBrush($sweepRect, [System.Drawing.Color]::FromArgb(0, 255, 255, 255), [System.Drawing.Color]::FromArgb(55, 255, 255, 255), 0)
    $g.FillRectangle($sweep, $sweepX, 0, 110, $wH)
    $sweep.Dispose()

    $lineBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(220, 124, 58, 237))
    $g.FillRectangle($lineBrush, 62, 58, 140, 2)
    $lineBrush.Dispose()

    $c.Bitmap.Save((Join-Path $outDir ("welcome{0:D2}.bmp" -f $i)), [System.Drawing.Imaging.ImageFormat]::Bmp)
    $titleFont.Dispose(); $subFont.Dispose(); $white.Dispose(); $soft.Dispose(); $g.Dispose(); $c.Bitmap.Dispose()
}

# ---------------------------------------------------------------------------
# Credits animation: 280x56, 16 frames at 10 fps.
# ---------------------------------------------------------------------------
$cW = 280
$cH = 56
$cFrames = 16
for ($i = 0; $i -lt $cFrames; $i++) {
    $phase = ($i / $cFrames) * [Math]::PI * 2
    $c = New-Canvas -Width $cW -Height $cH -Phase $phase -HueShift 0.9
    $g = $c.Graphics

    $g.DrawImage($icon, 12, 10, 36, 36)

    $titleFont = New-Object System.Drawing.Font("Segoe UI", 11, [System.Drawing.FontStyle]::Bold)
    $subFont = New-Object System.Drawing.Font("Segoe UI", 7)
    $white = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
    $soft = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(225, 226, 220, 255))
    $g.DrawString("AGPL-3.0", $titleFont, $white, 58, 8)
    $g.DrawString("OPEN SOURCE", $subFont, $soft, 59, 28)

    # Travelling accent dot under the text.
    $dotX = 58 + [int](([Math]::Sin($phase) + 1) * 80)
    $dotBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 124, 58, 237))
    $g.FillEllipse($dotBrush, $dotX, 42, 5, 5)
    $dotBrush.Dispose()

    $lineBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(90, 255, 255, 255))
    $g.FillRectangle($lineBrush, 58, 45, 130, 1)
    $lineBrush.Dispose()

    $c.Bitmap.Save((Join-Path $outDir ("credits{0:D2}.bmp" -f $i)), [System.Drawing.Imaging.ImageFormat]::Bmp)
    $titleFont.Dispose(); $subFont.Dispose(); $white.Dispose(); $soft.Dispose(); $g.Dispose(); $c.Bitmap.Dispose()
}

# ---------------------------------------------------------------------------
# Options animation: 280x56, 20 frames at 12 fps.
# ---------------------------------------------------------------------------
$oW = 280
$oH = 56
$oFrames = 20
for ($i = 0; $i -lt $oFrames; $i++) {
    $phase = ($i / $oFrames) * [Math]::PI * 2
    $c = New-Canvas -Width $oW -Height $oH -Phase $phase -HueShift 1.7
    $g = $c.Graphics

    # Rotating arcs around the logo.
    $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(200, 124, 58, 237), 3)
    $rectArc = New-Object System.Drawing.Rectangle(16, 10, 36, 36)
    $g.DrawArc($pen, $rectArc, [float]($phase * 180 / [Math]::PI), 110)
    $pen.Dispose()
    $pen2 = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(130, 255, 255, 255), 1)
    $g.DrawArc($pen2, $rectArc, [float]($phase * 180 / [Math]::PI + 180), 70)
    $pen2.Dispose()

    $g.DrawImage($icon, 22, 16, 24, 24)

    $titleFont = New-Object System.Drawing.Font("Segoe UI", 11, [System.Drawing.FontStyle]::Bold)
    $subFont = New-Object System.Drawing.Font("Segoe UI", 7)
    $white = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
    $soft = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(225, 226, 220, 255))
    $g.DrawString("MAKE IT YOURS", $titleFont, $white, 62, 10)
    $g.DrawString("CHOOSE YOUR SETUP", $subFont, $soft, 63, 30)

    $c.Bitmap.Save((Join-Path $outDir ("options{0:D2}.bmp" -f $i)), [System.Drawing.Imaging.ImageFormat]::Bmp)
    $titleFont.Dispose(); $subFont.Dispose(); $white.Dispose(); $soft.Dispose(); $g.Dispose(); $c.Bitmap.Dispose()
}


# ---------------------------------------------------------------------------
# Finish animation: 280x80, 24 frames at 12 fps.
# Draws a check mark progressively and adds a soft mint glow.
# ---------------------------------------------------------------------------
$fW = 280
$fH = 80
$fFrames = 24
for ($i = 0; $i -lt $fFrames; $i++) {
    $phase = ($i / $fFrames) * [Math]::PI * 2
    $c = New-Canvas -Width $fW -Height $fH -Phase $phase -HueShift 2.4
    $g = $c.Graphics

    $glowSize = 64 + [int](10 * [Math]::Sin($phase))
    $glowBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(60, 124, 214, 124))
    $g.FillEllipse($glowBrush, 20, [int](($fH - $glowSize) / 2), $glowSize, $glowSize)
    $glowBrush.Dispose()

    $g.DrawImage($icon, 28, 22, 36, 36)

    # Check mark: two segments drawn progressively.
    $progress = [Math]::Min(1.0, ($i + 1) / ($fFrames * 0.7))
    $cx = 116
    $cy = 40
    $p1x = $cx - 16; $p1y = $cy
    $p2x = $cx - 4;  $p2y = $cy + 12
    $p3x = $cx + 18; $p3y = $cy - 12
    $checkPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 124, 214, 124), 4)
    $checkPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $checkPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    if ($progress -le 0.5) {
        $t = $progress / 0.5
        $ex = $p1x + ($p2x - $p1x) * $t
        $ey = $p1y + ($p2y - $p1y) * $t
        $g.DrawLine($checkPen, $p1x, $p1y, [int]$ex, [int]$ey)
    } else {
        $g.DrawLine($checkPen, $p1x, $p1y, $p2x, $p2y)
        $t = ($progress - 0.5) / 0.5
        $ex = $p2x + ($p3x - $p2x) * $t
        $ey = $p2y + ($p3y - $p2y) * $t
        $g.DrawLine($checkPen, $p2x, $p2y, [int]$ex, [int]$ey)
    }
    $checkPen.Dispose()

    $titleFont = New-Object System.Drawing.Font("Segoe UI", 12, [System.Drawing.FontStyle]::Bold)
    $subFont = New-Object System.Drawing.Font("Segoe UI", 7)
    $white = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
    $soft = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(225, 226, 220, 255))
    $g.DrawString("READY TO UPSCALE", $titleFont, $white, 146, 16)
    $g.DrawString("INSTALLATION COMPLETE", $subFont, $soft, 147, 38)

    # Sparkles that fade in and out.
    for ($s = 0; $s -lt 4; $s++) {
        $sx = 40 + ($s * 44)
        $sy = 12 + [int](6 * [Math]::Sin($phase + $s))
        $alpha = 40 + [int](110 * [Math]::Abs([Math]::Sin($phase + $s * 0.7)))
        $sparkle = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb($alpha, 255, 255, 255))
        $g.FillEllipse($sparkle, $sx, $sy, 2, 2)
        $sparkle.Dispose()
    }

    $c.Bitmap.Save((Join-Path $outDir ("finish{0:D2}.bmp" -f $i)), [System.Drawing.Imaging.ImageFormat]::Bmp)
    $titleFont.Dispose(); $subFont.Dispose(); $white.Dispose(); $soft.Dispose(); $g.Dispose(); $c.Bitmap.Dispose()
}

# ---------------------------------------------------------------------------
# Static sidebar 164x314 and header 150x57.
# ---------------------------------------------------------------------------
function New-StaticBranding {
    param([int]$Width, [int]$Height, [double]$Phase)
    $c = New-Canvas -Width $Width -Height $Height -Phase $Phase -HueShift 1.1
    return $c
}

$sc = New-StaticBranding -Width 164 -Height 314 -Phase 1.4
$sg = $sc.Graphics
$sg.DrawImage($icon, 36, 78, 92, 92)
$tFont = New-Object System.Drawing.Font("Segoe UI", 13, [System.Drawing.FontStyle]::Bold)
$sFont = New-Object System.Drawing.Font("Segoe UI", 7.5)
$white = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
$soft = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(220, 215, 220, 255))
$sf = New-Object System.Drawing.StringFormat
$sf.Alignment = [System.Drawing.StringAlignment]::Center
$sg.DrawString("UPSCAYL", $tFont, $white, (New-Object System.Drawing.RectangleF(0, 196, 164, 28)), $sf)
$sg.DrawString("NEXT", $tFont, $white, (New-Object System.Drawing.RectangleF(0, 220, 164, 28)), $sf)
$sg.DrawString("AI IMAGE UPSCALER", $sFont, $soft, (New-Object System.Drawing.RectangleF(0, 258, 164, 20)), $sf)
$sg.DrawString("AGPL-3.0", $sFont, $soft, (New-Object System.Drawing.RectangleF(0, 278, 164, 20)), $sf)
$sc.Bitmap.Save((Join-Path $outDir "installerSidebar.bmp"), [System.Drawing.Imaging.ImageFormat]::Bmp)

$hc = New-StaticBranding -Width 150 -Height 57 -Phase 0.7
$hg = $hc.Graphics
$hg.DrawImage($icon, 8, 11, 34, 34)
$hFont = New-Object System.Drawing.Font("Segoe UI", 12, [System.Drawing.FontStyle]::Bold)
$hg.DrawString("UPSCAYL-NEXT", $hFont, $white, 48, 18)
$hc.Bitmap.Save((Join-Path $outDir "installerHeader.bmp"), [System.Drawing.Imaging.ImageFormat]::Bmp)


# ---------------------------------------------------------------------------
# Convert the generated BMP frame sequences into AVI animations.
# The NSIS SysAnimate32 control needs an uncompressed AVI for reliability.
# ---------------------------------------------------------------------------
function Convert-FramesToAvi {
    param(
        [string]$Name,
        [int]$Fps
    )
    if (-not $ffmpeg) {
        Write-Warning "ffmpeg was not found on PATH. Keeping any existing $Name.avi file."
        return
    }
    $pattern = Join-Path $outDir "$Name%02d.bmp"
    $avi = Join-Path $outDir "$Name.avi"
    & $ffmpeg -y -loglevel error -framerate $Fps -i $pattern -c:v rawvideo -pix_fmt bgr24 $avi
    if ($LASTEXITCODE -ne 0) {
        throw "ffmpeg failed while creating $avi"
    }
    Write-Host "Created $avi"
}

# Remove intermediate BMP frames so only the AVI files are kept in the repo.
function Remove-FrameFiles {
    param([string]$Name)
    Get-ChildItem -LiteralPath $outDir -Filter "$Name*.bmp" -ErrorAction SilentlyContinue |
        Remove-Item -Force -ErrorAction SilentlyContinue
}

Convert-FramesToAvi -Name "welcome" -Fps 12
Convert-FramesToAvi -Name "credits" -Fps 10
Convert-FramesToAvi -Name "options" -Fps 12
Convert-FramesToAvi -Name "finish" -Fps 12

if ($ffmpeg) {
    foreach ($name in @("welcome", "credits", "options", "finish")) {
        Remove-FrameFiles -Name $name
    }
}

# If ffmpeg is unavailable, reuse any existing AVI so the NSIS build still has
# a valid file for every animated page.
if (-not $ffmpeg) {
    $fallback = Join-Path $outDir "banner.avi"
    if (-not (Test-Path -LiteralPath $fallback)) {
        $fallback = Join-Path $outDir "welcome.avi"
    }
    if (Test-Path -LiteralPath $fallback) {
        foreach ($name in @("welcome", "credits", "options", "finish")) {
            $target = Join-Path $outDir "$name.avi"
            if (-not (Test-Path -LiteralPath $target)) {
                Copy-Item -LiteralPath $fallback -Destination $target -Force
            }
        }
        Write-Warning "Reused an existing AVI for the animated pages."
    } else {
        Write-Warning "No fallback AVI found. Create build/anim/banner.avi or install ffmpeg."
    }
}

# Dispose static drawing objects.
$sf.Dispose(); $white.Dispose(); $soft.Dispose(); $tFont.Dispose(); $sFont.Dispose()
$sg.Dispose(); $sc.Bitmap.Dispose(); $hFont.Dispose(); $hg.Dispose(); $hc.Bitmap.Dispose()
$icon.Dispose()

Write-Host "Generated installer artwork in $outDir"

