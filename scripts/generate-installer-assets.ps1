# Generates animated artwork for the custom NSIS installer.
# Run from the upscayl folder: pwsh -File scripts/generate-installer-assets.ps1
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$iconPath = Join-Path $root "build\icon.png"
$outDir = Join-Path $root "build\anim"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$icon = [System.Drawing.Image]::FromFile($iconPath)

function New-GradientCanvas {
    param([int]$Width, [int]$Height, [double]$Phase)
    $bmp = New-Object System.Drawing.Bitmap($Width, $Height, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $c1 = [System.Drawing.Color]::FromArgb(255, 18 + [int](10 * [Math]::Sin($Phase)), 14, 48 + [int](14 * [Math]::Sin($Phase + 1)))
    $c2 = [System.Drawing.Color]::FromArgb(255, 56 + [int](18 * [Math]::Cos($Phase)), 28, 136 + [int](26 * [Math]::Sin($Phase)))
    $rect = New-Object System.Drawing.Rectangle(0, 0, $Width, $Height)
    $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, $c1, $c2, 35)
    $g.FillRectangle($brush, $rect)
    $brush.Dispose()
    return @{ Bitmap = $bmp; Graphics = $g }
}

# Animated welcome banner 280x60.
$bannerW = 280
$bannerH = 60
$frames = 16
for ($i = 0; $i -lt $frames; $i++) {
    $phase = ($i / $frames) * [Math]::PI * 2
    $c = New-GradientCanvas -Width $bannerW -Height $bannerH -Phase $phase
    $g = $c.Graphics
    $glow = 44 + [int](6 * [Math]::Sin($phase))
    $glowBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(80, 130, 90, 255))
    $g.FillEllipse($glowBrush, 12, [int](($bannerH - $glow) / 2), $glow, $glow)
    $glowBrush.Dispose()
    $logo = 36 + [int](4 * [Math]::Cos($phase))
    $g.DrawImage($icon, 16, [int](($bannerH - $logo) / 2), $logo, $logo)
    $titleFont = New-Object System.Drawing.Font("Segoe UI", 15, [System.Drawing.FontStyle]::Bold)
    $subFont = New-Object System.Drawing.Font("Segoe UI", 7.5)
    $white = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
    $soft = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(225, 215, 220, 255))
    $g.DrawString("UPSCAYL", $titleFont, $white, 62, 10)
    $g.DrawString("N E X T", $titleFont, $soft, 148, 10)
    $g.DrawString("AI IMAGE UPSCALER", $subFont, $soft, 64, 36)
    $sweepX = [int](($phase / ([Math]::PI * 2)) * ($bannerW + 120)) - 120
    $sweepRect = New-Object System.Drawing.Rectangle($sweepX, 0, 100, $bannerH)
    $sweep = New-Object System.Drawing.Drawing2D.LinearGradientBrush($sweepRect, [System.Drawing.Color]::FromArgb(0, 255, 255, 255), [System.Drawing.Color]::FromArgb(55, 255, 255, 255), 0)
    $g.FillRectangle($sweep, $sweepX, 0, 100, $bannerH)
    $sweep.Dispose()
    $c.Bitmap.Save((Join-Path $outDir ("banner{0:D2}.bmp" -f $i)), [System.Drawing.Imaging.ImageFormat]::Bmp)
    $titleFont.Dispose(); $subFont.Dispose(); $white.Dispose(); $soft.Dispose(); $g.Dispose(); $c.Bitmap.Dispose()
}

# Static sidebar 164x314.
$sideW = 164
$sideH = 314
$sc = New-GradientCanvas -Width $sideW -Height $sideH -Phase 1.4
$sg = $sc.Graphics
$sgLogo = 92
$sgX = [int](($sideW - $sgLogo) / 2)
$sg.DrawImage($icon, $sgX, 84, $sgLogo, $sgLogo)
$tFont = New-Object System.Drawing.Font("Segoe UI", 13, [System.Drawing.FontStyle]::Bold)
$sFont = New-Object System.Drawing.Font("Segoe UI", 7.5)
$white = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
$soft = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(220, 215, 220, 255))
$sf = New-Object System.Drawing.StringFormat
$sf.Alignment = [System.Drawing.StringAlignment]::Center
$sg.DrawString("UPSCAYL", $tFont, $white, (New-Object System.Drawing.RectangleF(0, 205, $sideW, 28)), $sf)
$sg.DrawString("NEXT", $tFont, $white, (New-Object System.Drawing.RectangleF(0, 230, $sideW, 28)), $sf)
$sg.DrawString("AI IMAGE UPSCALER", $sFont, $soft, (New-Object System.Drawing.RectangleF(0, 268, $sideW, 20)), $sf)
$sc.Bitmap.Save((Join-Path $outDir "installerSidebar.bmp"), [System.Drawing.Imaging.ImageFormat]::Bmp)

# Header strip 150x57.
$hc = New-GradientCanvas -Width 150 -Height 57 -Phase 0.7
$hg = $hc.Graphics
$hg.DrawImage($icon, 8, 11, 34, 34)
$hFont = New-Object System.Drawing.Font("Segoe UI", 12, [System.Drawing.FontStyle]::Bold)
$hg.DrawString("UPSCAYL-NEXT", $hFont, $white, 48, 18)
$hc.Bitmap.Save((Join-Path $outDir "installerHeader.bmp"), [System.Drawing.Imaging.ImageFormat]::Bmp)

$sf.Dispose(); $white.Dispose(); $soft.Dispose(); $tFont.Dispose(); $sFont.Dispose(); $sg.Dispose(); $sc.Bitmap.Dispose()
$hFont.Dispose(); $hg.Dispose(); $hc.Bitmap.Dispose(); $icon.Dispose()
Write-Host "Generated installer artwork in $outDir"
