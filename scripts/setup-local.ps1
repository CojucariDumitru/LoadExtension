# Clone LoadExtension OUTSIDE OneDrive (OneDrive can revert git files).
# Run in PowerShell:
#   powershell -ExecutionPolicy Bypass -File scripts/setup-local.ps1

$ErrorActionPreference = "Stop"
$Target = "C:\LoadExtension"

Write-Host "Installing to $Target (not OneDrive)..." -ForegroundColor Cyan

if (Test-Path $Target) {
  Set-Location $Target
  git fetch origin
  git reset --hard origin/main
} else {
  git clone https://github.com/CojucariDumitru/LoadExtension.git $Target
  Set-Location $Target
}

npm install
npm run build

Write-Host ""
Write-Host "SUCCESS. In Chrome:" -ForegroundColor Green
Write-Host "  1. chrome://extensions"
Write-Host "  2. Remove old LoadExtension"
Write-Host "  3. Load unpacked -> $Target"
Write-Host "  4. Build must show: your version : 0.4.3"
