# Script para iniciar el backend en Windows
# Asegura que Python 3.14 está en el PATH

$python314 = "C:\Users\react\AppData\Local\Programs\Python\Python314"
$pythonScripts = "$python314\Scripts"

# Remover WindowsApps del PATH y agregar Python 3.14 al inicio
$newPath = ($env:Path -split ';' | Where-Object { -not $_.Contains('WindowsApps') }) -join ';'
$env:Path = "$python314;$pythonScripts;$newPath"

cd "$PSScriptRoot\backend"

Write-Host "Iniciando backend (puerto 8000)..." -ForegroundColor Cyan
Write-Host "Presiona Ctrl+C para detener" -ForegroundColor Yellow
Start-Sleep -Seconds 1

python -m poetry run uvicorn backend.main:app --reload --port 8000
