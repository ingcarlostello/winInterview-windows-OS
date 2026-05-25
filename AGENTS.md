# AGENTS.md

## Architecture

- **Tauri v2 desktop app** (React + TypeScript frontend, Rust shell, Python orchestration backend)
- **Frontend**: `src/` — React 19, Tailwind CSS v4, Zustand, Vite
- **Desktop shell**: `src-tauri/` — Rust (minimal; only native window commands + global shortcut plugin)
- **Orchestration backend**: `backend/` — FastAPI + WebSockets, managed via Poetry. Calls DashScope API (Qwen2.5 for LLM, SenseVoice/Paraformer for STT)
- The app runs as a transparent, always-on-top overlay (`420×320`, frameless) designed to float over Zoom/Meet

## Commands

```bash
# Frontend
npm run dev          # Vite dev server on :5173 (strict port)
npm run build        # tsc -b && vite build
npm run lint         # eslint . (flat config)
npm run preview      # Vite preview (production build)

# Tauri (must have Rust toolchain)
npm run tauri dev    # Starts Vite dev + Tauri window
npm run tauri build  # Builds Vite frontend, then Tauri bundle

# Backend
cd backend
poetry install       # Requires Python >= 3.14
poetry run uvicorn backend.main:app --reload
```

## Build order matters

Tauri bundles the Vite output from `dist/`. Run `npm run build` before `npm run tauri build` if you need a fresh frontend build. The `tauri build` command runs `npm run build` automatically via `beforeBuildCommand`, so the direct `npm run tauri build` is sufficient.

## Key constraints

- **`verbatimModuleSyntax`** is enabled — all type imports must use `import type { ... }` syntax, and `export type` for type-only exports
- **`noUnusedLocals` / `noUnusedParameters`** are enabled — the build (`tsc -b`) will fail on unused variables
- **`erasableSyntaxOnly`** is enabled — no enums, no `declare` class fields, no legacy namespaces
- **Tailwind CSS v4** uses `@import "tailwindcss"` (no `tailwind.config.*` file — configure in CSS via `@theme`)
- **Python >= 3.14** is required for the backend
- Vite dev server uses **strict port 5173**; Tauri expects it there

## Environment

- Backend requires `DASHSCOPE_API_KEY` in `backend/.env` — see `backend/.env.example`
- The `.gitignore` ignores `.env` and `backend/.env`

## Global shortcut

`Ctrl+Shift+Space` toggles `alwaysOnTop` for the Tauri window. Defined in `src-tauri/src/lib.rs:24`.

## Rust/Tauri notes

- Rust changes in `src-tauri/` require a rebuild of the Tauri binary — the Vite HMR does not cover them
- The `src-tauri/capabilities/default.json` currently only grants `core:default` permissions; extend this when adding new Tauri plugin permissions
- `main.rs` sets `windows_subsystem = "windows"` in release mode — console output is suppressed on Windows
