# Shows exactly what version is in THIS folder.
$path = Split-Path $PSScriptRoot -Parent

Write-Host ""
Write-Host "Folder: $path" -ForegroundColor Cyan

if (Test-Path "$path\VERSION") {
  Write-Host "VERSION file     : $((Get-Content "$path\VERSION" -Raw).Trim())"
} else {
  Write-Host "VERSION file     : MISSING" -ForegroundColor Red
}

if (Test-Path "$path\manifest.json") {
  $manifest = Get-Content "$path\manifest.json" -Raw | ConvertFrom-Json
  Write-Host "manifest.json    : $($manifest.version)"
} else {
  Write-Host "manifest.json    : MISSING" -ForegroundColor Red
}

if (Test-Path "$path\dist\content.js") {
  $kb = [math]::Round((Get-Item "$path\dist\content.js").Length / 1024, 1)
  Write-Host "dist/content.js  : ${kb}kb"
} else {
  Write-Host "dist/content.js  : MISSING" -ForegroundColor Red
}

$hasPopup = Test-Path "$path\dist\popup.js"
$hasRts = Test-Path "$path\dist\rts-capture.js"
Write-Host "dist/popup.js    : $(if ($hasPopup) { 'yes' } else { 'NO' })"
Write-Host "dist/rts-capture : $(if ($hasRts) { 'yes' } else { 'NO' })"

Write-Host ""
$ver = if (Test-Path "$path\VERSION") { (Get-Content "$path\VERSION" -Raw).Trim() } else { "" }
if ($ver -eq "0.4.5") {
  Write-Host "OK - reload extension in chrome://extensions" -ForegroundColor Green
} else {
  Write-Host "OUTDATED (have $ver, need 0.4.5)" -ForegroundColor Red
  Write-Host "Run: powershell -ExecutionPolicy Bypass -File scripts\setup-local.ps1"
}
Write-Host ""
