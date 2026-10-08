# Draws the app icons (icons/app-*.png): clipboard (accent blue clip) with a checklist and a small flask.
# Maskable = light blue background (Android / iPhone).
# Run: powershell -NoProfile -ExecutionPolicy Bypass -File tools/make-icons.ps1
Add-Type -AssemblyName System.Drawing
$out = Join-Path $PSScriptRoot '..\icons'
if (-not (Test-Path $out)) { New-Item -ItemType Directory -Path $out | Out-Null }

function RoundRect([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
  $p = New-Object Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $p.AddArc($x, $y, $d, $d, 180, 90)
  $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $p.CloseFigure()
  return $p
}
function Brush($hex) { return New-Object Drawing.SolidBrush ([Drawing.ColorTranslator]::FromHtml($hex)) }
function Pen($hex, [float]$w) {
  $p = New-Object Drawing.Pen ([Drawing.ColorTranslator]::FromHtml($hex)), $w
  $p.StartCap = 'Round'; $p.EndCap = 'Round'; $p.LineJoin = 'Round'
  return $p
}

function DrawIcon {
  $bmp = New-Object Drawing.Bitmap 512, 512
  $g = [Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.Clear([Drawing.Color]::Transparent)

  # board shadow, board (paper), clip
  $g.FillPath((Brush '#D9DEEA'), (RoundRect 92 92 328 384 44))
  $g.FillPath((Brush '#FFFFFF'), (RoundRect 92 78 328 384 44))
  $g.DrawPath((Pen '#C9D2E8' 6), (RoundRect 92 78 328 384 44))
  $g.FillPath((Brush '#3D63DD'), (RoundRect 186 52 140 64 22))
  $g.FillPath((Brush '#FFFFFF'), (RoundRect 238 66 36 20 10))

  # checklist: two checked rows
  $check = Pen '#2BB39A' 20
  $line = Brush '#E3E7F2'
  foreach ($y in 176, 252) {
    $pts = [Drawing.PointF[]]@((New-Object Drawing.PointF 140, $y), (New-Object Drawing.PointF 162, ($y + 20)), (New-Object Drawing.PointF 200, ($y - 20)))
    $g.DrawLines($check, $pts)
    $g.FillPath($line, (RoundRect 230 ($y - 12) 142 24 12))
  }

  # flask (bottom right): neck + body outline, liquid
  $flask = New-Object Drawing.Drawing2D.GraphicsPath
  $flask.AddLines([Drawing.PointF[]]@(
    (New-Object Drawing.PointF 268, 312), (New-Object Drawing.PointF 268, 352), (New-Object Drawing.PointF 222, 428),
    (New-Object Drawing.PointF 362, 428), (New-Object Drawing.PointF 316, 352), (New-Object Drawing.PointF 316, 312)))
  $g.SetClip($flask)
  $g.FillRectangle((Brush '#9FB4F2'), 200, 380, 200, 60)
  $g.ResetClip()
  $g.DrawPath((Pen '#3D63DD' 14), $flask)
  $g.DrawLine((Pen '#3D63DD' 14), 256, 312, 328, 312)
  $g.FillPath($line, (RoundRect 140 322 60 24 12))
  $g.FillPath($line, (RoundRect 140 380 60 24 12))
  $g.Dispose()
  return $bmp
}

function Save($bmp, [int]$size, $name) {
  $dst = New-Object Drawing.Bitmap $size, $size
  $g = [Drawing.Graphics]::FromImage($dst)
  $g.InterpolationMode = 'HighQualityBicubic'
  $g.SmoothingMode = 'AntiAlias'
  $g.DrawImage($bmp, 0, 0, $size, $size)
  $g.Dispose()
  $dst.Save((Join-Path $out $name), [Drawing.Imaging.ImageFormat]::Png)
  $dst.Dispose()
}

$icon = DrawIcon
Save $icon 512 'app-512.png'
Save $icon 192 'app-192.png'

# maskable: keep the drawing inside the safe zone (center 80%)
$mask = New-Object Drawing.Bitmap 512, 512
$g = [Drawing.Graphics]::FromImage($mask)
$g.InterpolationMode = 'HighQualityBicubic'
$g.Clear([Drawing.ColorTranslator]::FromHtml('#E9EEFF'))
$g.DrawImage($icon, 64, 64, 384, 384)
$g.Dispose()
Save $mask 512 'app-maskable-512.png'
Save $mask 192 'app-maskable-192.png'
Write-Host 'icons written'
