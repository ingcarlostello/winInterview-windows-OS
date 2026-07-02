# Script para iniciar el frontend en Windows

cd "$PSScriptRoot"

Write-Host "Instalando dependencias del frontend (npm install)..." -ForegroundColor Cyan
npm install

Write-Host "Iniciando Tauri dev..." -ForegroundColor Cyan
Write-Host "Presiona Ctrl+C para detener" -ForegroundColor Yellow
Start-Sleep -Seconds 1

npm run tauri dev
