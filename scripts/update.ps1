# Run from the LoadExtension folder:
#   powershell -ExecutionPolicy Bypass -File scripts/update.ps1

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..

Write-Host "Updating LoadExtension..." -ForegroundColor Cyan

if (-not (Test-Path ".git")) {
  Write-Host "ERROR: This folder is not a git repo." -ForegroundColor Red
  Write-Host "Run these commands first:"
  Write-Host "  git init"
  Write-Host "  git remote add origin https://github.com/CojucariDumitru/LoadExtension.git"
  Write-Host "  git fetch origin"
  Write-Host "  git checkout -f -b main origin/main"
  exit 1
}

git fetch origin
git reset --hard origin/main

npm install
npm run build

Write-Host ""
Write-Host "Done. Now reload the extension in chrome://extensions" -ForegroundColor Green
