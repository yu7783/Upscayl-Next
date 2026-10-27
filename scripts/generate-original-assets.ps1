Add-Type -AssemblyName System.Drawing

$root = "c:\Users\nnyk0\programings\Upscayl\upscayl"

function New-IconBitmap([int]$size, [string]$variant) {
  $bmp = New-Object System.Drawing.Bitmap($size, $size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear([System.Drawing.Color]::Transparent)

  # Rounded square with a diagonal gradient. Teal -> violet is intentionally
  # different from the original blue Upscayl mark so no old branding remains.
  $rect = New-Object System.Drawing.Rectangle(0, 0, $size, $size)
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $r = [int]($size * 0.22)
  $path.AddArc(0, 0, $r * 2, $r * 2, 180, 90)
  $path.AddArc($size - $r * 2, 0, $r * 2, $r * 2, 270, 90)
  $path.AddArc($size - $r * 2, $size - $r * 2, $r * 2, $r * 2, 0, 90)
  $path.AddArc(0, $size - $r * 2, $r * 2, $r * 2, 90, 90)
  $path.CloseFigure()

  $c1 = [System.Drawing.Color]::FromArgb(255, 20, 184, 166)
  $c2 = [System.Drawing.Color]::FromArgb(255, 124, 58, 237)
  if ($variant -eq "purple") {
    $c1 = [System.Drawing.Color]::FromArgb(255, 139, 92, 246)
    $c2 = [System.Drawing.Color]::FromArgb(255, 236, 72, 153)
  }
  $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, $c1, $c2, 45)
  $g.FillPath($brush, $path)

  # Frame corners suggest "upscaling a crop".
  $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::White, [float]($size * 0.055))
  $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $m = [int]($size * 0.26)
  $len = [int]($size * 0.14)
  $g.DrawLine($pen, $m, $m + $len, $m, $m)
  $g.DrawLine($pen, $m, $m, $m + $len, $m)
  $g.DrawLine($pen, $size - $m - $len, $m, $size - $m, $m)
  $g.DrawLine($pen, $size - $m, $m, $size - $m, $m + $len)
  $g.DrawLine($pen, $m, $size - $m - $len, $m, $size - $m)
  $g.DrawLine($pen, $m, $size - $m, $m + $len, $size - $m)
  $g.DrawLine($pen, $size - $m - $len, $size - $m, $size - $m, $size - $m)
  $g.DrawLine($pen, $size - $m, $size - $m, $size - $m, $size - $m - $len)

  # Upward chevron in the middle.
  $cx = $size / 2
  $cy = $size * 0.56
  $w = $size * 0.20
  $h = $size * 0.13
  $points = @(
    (New-Object System.Drawing.PointF(($cx - $w), ($cy + $h))),
    (New-Object System.Drawing.PointF($cx, ($cy - $h))),
    (New-Object System.Drawing.PointF(($cx + $w), ($cy + $h)))
  )
  $g.DrawLines($pen, $points)

  $g.Dispose()
  $brush.Dispose()
  $pen.Dispose()
  $path.Dispose()
  return $bmp
}

function Save-Png([System.Drawing.Bitmap]$bmp, [string]$path) {
  $dir = Split-Path -Parent $path
  if (!(Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
}

# --- Application icon PNGs -------------------------------------------------
$icon512 = New-IconBitmap 512 "default"
Save-Png $icon512 "$root\build\icon.png"
Save-Png $icon512 "$root\electron\build\icon.png"
Save-Png $icon512 "$root\resources\icons\512x512.png"
Save-Png $icon512 "$root\resources\512x512.png"
Save-Png $icon512 "$root\renderer\public\icon.png"
Save-Png $icon512 "$root\export\build\icon.png"

# Generate every size electron-builder may request so no upstream icon file is
# left in resources/icons. 512x512 is written above; cover the rest here.
foreach ($size in 16, 24, 32, 48, 64, 128, 256) {
  $bmp = New-IconBitmap $size "default"
  Save-Png $bmp "$root\resources\icons\${size}x${size}.png"
  Save-Png $bmp "$root\resources\${size}x${size}.png"
  $bmp.Dispose()
}

$iconPurple = New-IconBitmap 512 "purple"
Save-Png $iconPurple "$root\renderer\public\icon-purple.png"

# --- Background image ------------------------------------------------------
$bg = New-Object System.Drawing.Bitmap(1920, 1080)
$g = [System.Drawing.Graphics]::FromImage($bg)
$rect = New-Object System.Drawing.Rectangle(0, 0, 1920, 1080)
$bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
  $rect,
  [System.Drawing.Color]::FromArgb(255, 15, 23, 42),
  [System.Drawing.Color]::FromArgb(255, 49, 46, 129),
  30
)
$g.FillRectangle($bgBrush, $rect)
$ringPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(28, 255, 255, 255), 2)
for ($i = 1; $i -le 12; $i++) {
  $d = $i * 130
  $g.DrawEllipse($ringPen, 960 - ($d / 2), 540 - ($d / 2), $d, $d)
}
$g.Dispose()
$bgBrush.Dispose()
$ringPen.Dispose()
Save-Png $bg "$root\build\background.png"
Save-Png $bg "$root\electron\build\background.png"
Save-Png $bg "$root\export\build\background.png"
$bg.Dispose()

# --- SVG assets ------------------------------------------------------------
$logoSvg = @'
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="none">
  <defs>
    <linearGradient id="orig-grad" x1="0" y1="0" x2="256" y2="256" gradientUnits="userSpaceOnUse">
      <stop stop-color="#14B8A6"/>
      <stop offset="1" stop-color="#7C3AED"/>
    </linearGradient>
  </defs>
  <rect width="256" height="256" rx="56" fill="url(#orig-grad)"/>
  <path d="M74 96V74h22M182 96V74h-22M74 160v22h22M182 160v22h-22"
        stroke="#FFFFFF" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M96 146l32-32 32 32"
        stroke="#FFFFFF" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
'@
Set-Content -Path "$root\renderer\public\logo.svg" -Value $logoSvg -NoNewline -Encoding UTF8
Set-Content -Path "$root\docs\logo\logo.svg" -Value $logoSvg -NoNewline -Encoding UTF8

$faviconSvg = @'
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
  <defs>
    <linearGradient id="fav-grad" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
      <stop stop-color="#14B8A6"/>
      <stop offset="1" stop-color="#7C3AED"/>
    </linearGradient>
  </defs>
  <rect width="64" height="64" rx="14" fill="url(#fav-grad)"/>
  <path d="M18 26v-8h8M46 26v-8h-8M18 38v8h8M46 38v8h-8"
        stroke="#FFFFFF" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M24 38l8-8 8 8"
        stroke="#FFFFFF" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
'@
Set-Content -Path "$root\docs\favicon.svg" -Value $faviconSvg -NoNewline -Encoding UTF8

$sidebarSvg = @'
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">
  <rect x="3" y="3" width="18" height="18" rx="4" stroke="currentColor" stroke-width="2"/>
  <path d="M9 3v18" stroke="currentColor" stroke-width="2"/>
</svg>
'@
Set-Content -Path "$root\renderer\public\sidebar.svg" -Value $sidebarSvg -NoNewline -Encoding UTF8

$alertSvg = @'
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">
  <path d="M12 3l9 16H3l9-16z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
  <path d="M12 9v4M12 16h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
</svg>
'@
Set-Content -Path "$root\renderer\public\alert-icon.svg" -Value $alertSvg -NoNewline -Encoding UTF8

$downSvg = @'
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">
  <path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
'@
Set-Content -Path "$root\renderer\public\down-arrow.svg" -Value $downSvg -NoNewline -Encoding UTF8

$placeholderSvg = @'
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200" fill="none">
  <rect width="320" height="200" rx="12" fill="#1F2937"/>
  <rect x="16" y="16" width="288" height="168" rx="8" stroke="#4B5563" stroke-width="2" stroke-dasharray="8 6"/>
  <path d="M132 128l28-32 28 32" stroke="#9CA3AF" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="126" cy="82" r="10" stroke="#9CA3AF" stroke-width="4"/>
</svg>
'@
Set-Content -Path "$root\renderer\public\original-placeholder.svg" -Value $placeholderSvg -NoNewline -Encoding UTF8

# --- Remove original binary icon formats ----------------------------------
Remove-Item "$root\build\icon.icns" -Force -ErrorAction SilentlyContinue
Remove-Item "$root\electron\build\icon.icns" -Force -ErrorAction SilentlyContinue
Remove-Item "$root\export\build\icon.icns" -Force -ErrorAction SilentlyContinue

# --- Remove upstream sample images/videos ---------------------------------
# These files belong to the original project and must not ship with this fork.
# Keeping the list here makes the cleanup reproducible after a fresh checkout.
$obsoleteMedia = @(
  "$root\1080p_banner.jpg",
  "$root\1080p_explainer.jpg",
  "$root\download.jpg",
  "$root\screen1.png",
  "$root\to_upscale.jpeg",
  "$root\ups\to_upscale.jpeg",
  "$root\upscayl.mp4",
  "$root\docs\image.png",
  "$root\docs\images\mac-1.png",
  "$root\scripts\baboon.png",
  "$root\scripts\baboon_upscaled.png",
  "$root\renderer\public\Upscayl New Page.png",
  "$root\renderer\public\model-comparison",
  "$root\renderer\out\model-comparison",
  "$root\renderer\out\Upscayl New Page.png",
  "$root\renderer\out\icon.png",
  "$root\renderer\out\icon-purple.png",
  "$root\renderer\out\alert-icon.svg",
  "$root\renderer\out\down-arrow.svg",
  "$root\renderer\out\logo.svg",
  "$root\renderer\out\sidebar.svg"
)
foreach ($item in $obsoleteMedia) {
  Remove-Item -LiteralPath $item -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Output "Original assets generated."

