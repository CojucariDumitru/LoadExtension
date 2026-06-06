# Fresh install to C:\LoadExtension (outside OneDrive).
# Run: powershell -ExecutionPolicy Bypass -File scripts/setup-local.ps1

$ErrorActionPreference = "Stop"
$Target = "C:\LoadExtension"

Write-Host "=== LoadExtension setup ===" -ForegroundColor Cyan
Write-Host "Target: $Target"
Write-Host ""

if (Test-Path $Target) {
  Write-Host "Removing old $Target ..."
  Remove-Item -Recurse -Force $Target
}

Write-Host "Cloning latest from GitHub ..."
git clone https://github.com/CojucariDumitru/LoadExtension.git $Target
Set-Location $Target

npm install
npm run build

Write-Host ""
powershell -ExecutionPolicy Bypass -File "$Target\scripts\check-version.ps1"

Write-Host "In Chrome:" -ForegroundColor Yellow
Write-Host "  1. chrome://extensions"
Write-Host "  2. REMOVE every LoadExtension"
Write-Host "  3. Load unpacked -> $Target"
Write-Host "  4. Toolbar must show v0.4.5"
