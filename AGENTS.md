# AGENTS.md

## Architecture

- **Tauri v2 desktop app** (React + TypeScript frontend, Rust shell, Python orchestration backend)
- **Frontend**: `src/` — React 19, Tailwind CSS v4, Zustand, Vite
- **Desktop shell**: `src-tauri/` — Rust (minimal; only native window commands + global shortcut plugin)
- **Orchestration backend**: `backend/` — FastAPI + WebSockets, managed via Poetry. Uses Deepgram SDK (nova-3 for ASR, gpt-4o-mini for LLM thinking)
- The app runs as a transparent, always-on-top overlay (`420×320`, frameless) designed to float over Zoom/Meet
- **Flow**: Microphone → PyAudio (16kHz PCM) + webrtcvad (VAD) → streamed to Deepgram Agent (ASR + LLM thinking) → Response chunks via WebSocket → Frontend renders bullets + code blocks

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

## Frontend

### State Management (Zustand)

Single store at `src/stores/interview.ts`:

| Field | Type | Purpose |
|---|---|---|
| `status` | `Status` | `idle` \| `connected` \| `listening` \| `thinking` \| `responding` \| `paused` \| `error` |
| `transcription` | `string` | Current interviewer question text |
| `responseChunks` | `string[]` | Accumulated LLM response chunks (streamed) |
| `error` | `string \| null` | Last error message |

Actions: `setStatus`, `setTranscription`, `addResponseChunk`, `clearResponse`, `setError`, `reset`

### WebSocket Hook

`src/hooks/useWebSocket.ts`:

- Connects to `ws://localhost:8000/ws`
- Auto-reconnect with 3-second delay on close
- Message types from backend: `status`, `transcription`, `chunk`, `error`
- Commands sent to backend: `pause`, `resume`, `clear` (plain text strings)
- Uses `mountedRef` to prevent state updates on unmounted components

### Components

| Component | Purpose |
|---|---|
| `App.tsx` | Root — wires `useWebSocket().send` to `Overlay` callbacks |
| `Overlay.tsx` | Main layout — header bar (StatusBar + Controls), Transcription, Response. Dark glass morphism |
| `StatusBar.tsx` | Status indicator dot with pulse animation per status. Labels in Spanish. Error text truncated to 200px |
| `Transcription.tsx` | Shows "Entrevistador" label + transcribed text. Shows "..." while thinking |
| `Response.tsx` | Custom parser: splits LLM output into bullets (`- ` or `* `) and code blocks (```` ``` ````). Code blocks in monospace green. Bullets with purple dots. Blinking cursor during streaming |
| `Controls.tsx` | Pause/Resume toggle (green/yellow), Clear button (subtle). Labels in Spanish |

### CSS

- Custom utility `scrollbar-thin` for thin scrollbars in `src/index.css`
- All user-facing text is in Spanish

## Backend

### Dependencies

| Package | Purpose |
|---|---|
| `deepgram-sdk` | Deepgram Agent SDK (nova-3 for ASR + gpt-4o-mini for LLM thinking via OpenAI provider) |
| `fastapi` | Web framework |
| `pyaudio` | Audio capture from microphone |
| `webrtcvad` | Voice Activity Detection |
| `uvicorn[standard]` | ASGI server |
| `websockets` | WebSocket exception handling |
| `python-dotenv` | Environment variable loading |

### Architecture

**Main app** (`backend/src/backend/main.py`):

- `GET /health` — Returns status and active connection count
- `WebSocket /ws` — Main endpoint with per-connection lifecycle:
  1. Creates session ID, accepts WebSocket
  2. Initializes Deepgram Agent via `DeepgramClient.agent.v1.connect()` in a daemon thread
  3. Sets up callbacks for transcription, response chunks, and errors via `EventType.MESSAGE`
  4. Starts audio capture and streams PCM 16kHz to Deepgram Agent
  5. Handles control messages: `pause`, `resume`, `clear`
  6. Cleanup on disconnect

**Key patterns**:
- Deepgram Agent handles VAD, ASR, and LLM internally
- Audio captured via PyAudio (16kHz, 16-bit, mono) + webrtcvad, then streamed to Deepgram
- `asyncio.run_coroutine_threadsafe` bridges sync audio callbacks to async event loop
- Agent runs in separate thread to avoid blocking the async WebSocket handler

### Modules

| Module | Purpose |
|---|---|
| `audio/capture.py` | PyAudio at 16kHz, 16-bit, mono + webrtcvad (aggressiveness 2). 20ms frames. Triggers speech start/end after 30 silence frames (~600ms) |
| `llm/prompt.py` | System prompt: "theater prompter" style. Max 3 bullets (each <2s read), max 3-line code examples, Spanish-only, no greetings |
| `ws_manager.py` | ConnectionManager with typed sends: `send_status`, `send_transcription`, `send_response_chunk`, `send_error` |

### WebSocket Message Format

All messages follow: `{"type": "...", "data": {...}}`

## Environment

- Backend requires `DEEPGRAM_API_KEY` in `backend/.env` — see `backend/.env.example`
- The `.gitignore` ignores `.env` and `backend/.env`

## Global shortcut

`Ctrl+Shift+Space` toggles `alwaysOnTop` for the Tauri window. Defined in `src-tauri/src/lib.rs:24`.

## Rust/Tauri notes

- Rust changes in `src-tauri/` require a rebuild of the Tauri binary — the Vite HMR does not cover them
- The `src-tauri/capabilities/default.json` grants `core:default` and `global-shortcut:default` permissions
- `main.rs` sets `windows_subsystem = "windows"` in release mode — console output is suppressed on Windows
- **`macos-private-api`** feature is enabled in `Cargo.toml` — required for transparent windows on macOS
- Window config in `tauri.conf.json`: 420x320, frameless, transparent, always-on-top, centered, CSP disabled

## Other files

- `desiciones.txt` — Design decisions log (Spanish), includes discarded alternatives (Preact, Electron, React Native Desktop, NiceGUI, CustomTkinter)
- `errores/` — Error screenshots directory (`error1.png`, `error2.png`)
