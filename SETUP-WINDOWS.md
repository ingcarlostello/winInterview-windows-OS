# Setup de winInterview en Windows

## Lo que hemos instalado

✅ Python 3.14.6  
✅ Poetry 2.4.1  
✅ Microsoft Visual Studio Build Tools 2026  
✅ Node.js (npm es el gestor canónico del repo)  
✅ Dependencias del backend (con sounddevice en lugar de pyaudio)

## Cómo iniciar la aplicación

### Opción 1: Scripts PowerShell (Recomendado)

**Terminal 1 — Backend:**
```powershell
# Desde la raíz del proyecto
.\start-backend.ps1
```

**Terminal 2 — Frontend + Tauri:**
```powershell
# Desde la raíz del proyecto
.\start-frontend.ps1
```

### Opción 2: Comandos manuales

**Terminal 1 — Backend:**
```powershell
$python314 = "C:\Users\react\AppData\Local\Programs\Python\Python314"
$env:Path = "$python314;$python314\Scripts;" + ($env:Path -split ';' | Where-Object { -not $_.Contains('WindowsApps') }) -join ';'

cd backend
poetry run uvicorn backend.main:app --reload --port 8000
```

**Terminal 2 — Frontend:**
```powershell
npm install  # Solo la primera vez
npm run tauri dev
```

## Requisitos previos

Si necesitas reinstalar algo:

```powershell
# Python 3.14
winget install Python.Python.3.14

# Visual Studio Build Tools (si falta)
winget install Microsoft.VisualStudio.BuildTools

# Node.js (si falta)
winget install OpenJS.NodeJS
```

## Cambios realizados

- Reemplazado `pyaudio` con `sounddevice` en el backend (más compatible con Windows)
- Creados scripts de inicio (`start-backend.ps1`, `start-frontend.ps1`)
- Configurado el PATH para evitar conflictos con el alias de Python del Microsoft Store

## Puertos

- **Backend**: http://localhost:8000
- **Frontend Vite Dev**: http://localhost:5173
- **WebSocket**: ws://localhost:8000/ws

## Troubleshooting

### Error: "poetry no se reconoce"
Asegúrate de estar en la carpeta raíz del proyecto y usa los scripts `start-*.ps1`

### Error: "npm run tauri no se reconoce"  
Primero ejecuta: `npm install`

### Error: "Backend no inicia"
Verifica que el puerto 8000 esté disponible: `netstat -an | findstr ":8000"`

## Variables de entorno

Crea un archivo `backend/.env` con:
```
DEEPGRAM_API_KEY=your_key_here
MINIMAX_API_KEY=your_key_here
```

Ver `backend/.env.example` para más detalles.
