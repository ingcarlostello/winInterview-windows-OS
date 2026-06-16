# AGENTS.md

## Architecture

- **Tauri v2 desktop app** (React + TypeScript frontend, Rust shell, Python orchestration backend)
- **Frontend**: `src/` — React 19, Tailwind CSS v4, Zustand, Vite, react-markdown, react-syntax-highlighter
- **Desktop shell**: `src-tauri/` — Rust (window management commands, global shortcuts, ghost mode, content protection)
- **Orchestration backend**: `backend/` — FastAPI + WebSockets, managed via Poetry. Uses Deepgram SDK (nova-3 for ASR), NVIDIA API (Gemma 3n for LLM), DashScope/Aliyun (Qwen for vision analysis)
- The app runs as a transparent, always-on-top overlay (`730×730` collapsed, `1600×730` expanded, frameless) designed to float over Zoom/Meet
- **Flow**: Microphone → PyAudio (16kHz PCM) → streamed to Deepgram Agent (ASR only) → transcription triggers LLM streaming via NVIDIA Gemma → Response chunks via WebSocket → Frontend renders Markdown + code blocks
- **Screen capture**: Tauri command `capture_screen` in `src-tauri/src/lib.rs` uses the `xcap` crate to capture the first monitor, resizes to a max width of 1280 px, encodes as JPEG (quality 75), and returns base64 → stored in Zustand (`screenImages`, max 4) → VisionLLMService (Qwen) analyzes via separate WebSocket

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
- **Screen capture is currently implemented in the Tauri Rust layer** using the `xcap` crate (captures the first available monitor)

## Frontend

### State Management (Zustand)

Single store at `src/stores/interview.ts` (persisted settings via `persist` middleware):

| Field | Type | Purpose |
|---|---|---|
| `status` | `Status` | `idle` \| `connected` \| `listening` \| `thinking` \| `responding` \| `paused` \| `error` \| `reconnecting` \| `capturing` |
| `language` | `'es' \| 'en'` | Current UI/API language |
| `transcription` | `string` | Current interviewer question text |
| `responseChunks` | `string[]` | Accumulated LLM response chunks (streamed) |
| `error` | `string \| null` | Last error message |
| `questionsAnswered` | `number` | Count of answered questions |
| `customPrompts` | `Record<string, string>` | Per-language custom prompts |
| `showPromptEditor` | `boolean` | Prompt editor visibility |
| `ghostMode` | `boolean` | Click-through mode |
| `contentProtected` | `boolean` | Content protection (blur) |
| `theme` | `'dark' \| 'glass'` | Visual theme |
| `screenPanelOpen` | `boolean` | Screen panel visibility |
| `screenImage` | `string \| null` | Latest screen capture (base64) |
| `screenImages` | `string[]` | Thumbnail grid (max 4) |
| `screenChunks` | `string[]` | Vision analysis response chunks |
| `isCapturingScreen` | `boolean` | Screen capture in progress |
| `isAnalyzingScreen` | `boolean` | Vision analysis in progress |
| `screenPrompt` | `string` | Custom vision analysis prompt |

Persisted settings: `customPrompts`, `language`, `theme`

Actions: `setStatus`, `setLanguage`, `setTranscription`, `addResponseChunk`, `clearResponse`, `setError`, `incrementQuestionsAnswered`, `setCustomPrompt`, `clearCustomPrompt`, `setShowPromptEditor`, `toggleGhostMode`, `toggleContentProtected`, `setTheme`, `toggleScreenPanel`, `setScreenImage`, `addScreenImage`, `clearScreenImages`, `addScreenChunk`, `clearScreenChunks`, `setCapturingScreen`, `setAnalyzingScreen`, `setScreenPrompt`, `reset`

### Hooks

**`src/hooks/useWebSocket.ts`**:

- Connects to `ws://localhost:8000/ws?lang=<lang>&prompt=<customPrompt>`
- Auto-reconnect with 3-second delay on close
- Message types from backend: `status`, `transcription`, `chunk`, `error`, `cleared`, `prompt_saved`, `prompt_cleared`
- Commands sent to backend: `pause`, `resume`, `clear`, `clear_prompt`, `set_language:<lang>`
- Helpers: `setPrompt()`, `restoreDefaultPrompt()`, `changeLanguage()`
- Auto-increments question counter when transitioning from `responding` to `listening`
- Uses `mountedRef` to prevent state updates on unmounted components

**`src/hooks/useTranslation.ts`**:

- Wraps `t()` function from translations, bound to current store language

### i18n

`src/i18n/translations.ts` — 47 keys for ES/EN with parameterized strings (e.g., `{count}`). Exported `t()` function does key lookup + parameter substitution.

### Components

| Component | Purpose |
|---|---|
| `App.tsx` | Root — wires `useWebSocket().send` to `Overlay` callbacks. Listens for Tauri `capture-screen-shortcut` event and invokes `capture_screen` command. Invokes `set_window_expanded` Tauri command |
| `Overlay.tsx` | Main layout — header bar (StatusBar + Controls), PromptEditor, Transcription, Response, QuestionCounter, ScreenPanel. Supports `dark` and `glass` themes. Ghost mode styling. Listens for Tauri `ghost-mode-changed` and `content-protected-changed` events |
| `StatusBar.tsx` | Bot icon, theme toggle (Dark/Liquid), screen reader toggle, language selector, ghost mode badge, content protection badge, status dot with pulse animation, microphone icon, error text. Uses `data-tauri-drag-region` for window dragging |
| `Transcription.tsx` | Shows "Entrevistador" label + transcribed text in bordered box. Shows placeholder when no content |
| `Response.tsx` | AI Copilot response area. Uses `react-markdown` + `remark-gfm` + `react-syntax-highlighter` (vscDarkPlus theme). Custom table styling. Blinking cursor (`▎`) during streaming. Three-dot animation while thinking. Copy button |
| `Controls.tsx` | Connect/Listen button (idle/error), connecting spinner, Pause/Resume toggle, End/Disconnect button, content protection toggle (Eye/EyeOff icons). Invokes Tauri `toggle_content_protected` command |
| `PromptEditor.tsx` | Collapsible editor. Textarea for custom prompt. Save button (triggers reconnect), Restore default button. Shows "Active prompt" indicator. Draft state synced with store on language change |
| `QuestionCounter.tsx` | Displays count of answered questions. Hidden when count is 0. Singular/plural handling via translations |
| `LanguageSelector.tsx` | Dropdown selector for ES/EN with flag emojis. Click-outside-to-close behavior. Updates store language and sends WebSocket language change command |
| `ScreenPanel.tsx` | Screen capture analysis panel. Thumbnail grid (max 4 captures). Capture button invokes Tauri `capture_screen` command. WebSocket connection to `ws://localhost:8000/api/ws/analyze-screens` for vision analysis. Prompt textarea for custom analysis instructions. Markdown-rendered solution output with syntax highlighting. Clear button |

### CSS

- Custom utilities in `src/index.css`: `scrollbar-thin`, `aura-active`, `glass-aura-active`, `glass-aura-idle`, `glass-base`, `glass-button`, `glass-button-active`, `icon-spin`, `dot-pulse-anim`, `ghost-active`
- Keyframe animations: `spin-slow`, `dot-pulse`, `ghost-pulse`
- All user-facing text uses i18n translations (ES/EN)

## Backend

### Dependencies

| Package | Purpose |
|---|---|
| `deepgram-sdk` | Deepgram Agent SDK (nova-3 for ASR only, linear16 encoding, 16kHz, smart_format, endpointing=1500ms) |
| `openai` | OpenAI-compatible client for NVIDIA API and DashScope |
| `fastapi` | Web framework |
| `pyaudio` | Audio capture from microphone |
| `pydantic-settings` | Configuration management |
| `uvicorn[standard]` | ASGI server |
| `websockets` | WebSocket exception handling |
| `python-dotenv` | Environment variable loading |

### Architecture

**Main app** (`backend/src/backend/main.py`):

- `GET /health` — Returns status and active connection count
- `WebSocket /ws` — Main endpoint with per-connection lifecycle (delegated to `AgentSession`)
- REST routers: `prompts` (CRUD for custom prompts), `screens` (screen capture + analysis)
- CORS middleware (allow all origins)

**Key patterns**:
- Deepgram Agent handles VAD and ASR only (no LLM)
- `AudioStreamingService` encapsulates the full audio pipeline (PyAudio + Deepgram) with callback-based async bridging
- `ConversationHistory` manages the message list with system prompt preservation and auto-trimming at 20 messages
- LLM streaming via DeepSeek API (deepseek-v4-flash) — separate from Deepgram
- Vision analysis via DashScope/Aliyun (Qwen) — separate WebSocket endpoint
- Audio captured via PyAudio (16kHz, 16-bit, mono) and streamed directly to Deepgram (no webrtcvad)
- `asyncio.run_coroutine_threadsafe` bridges sync Deepgram callbacks to async event loop
- Agent runs in separate thread to avoid blocking the async WebSocket handler
- Dependency injection via `@lru_cache` singletons in `dependencies.py`
- `AgentSession` constructor accepts optional `audio_service`, `history`, `screen_capture` for test injection
- `CommandParser` uses registry-based handler pattern (open/closed for new commands)

### Modules

| Module | Purpose |
|---|---|
| `config.py` | Pydantic settings: `deepgram_api_key`, `nvidia_api_key`, `dashscope_api_key`, `host`, `port` |
| `context.py` | `ConversationHistory` — message list management (system prompt + user/assistant messages, max 20, auto-trim). Used by `AgentSession` |
| `dependencies.py` | DI singletons: `get_connection_manager()`, `get_llm_service()` (DeepSeekLLMService), `get_vision_service()` (VisionLLMService) |
| `ws_manager.py` | `ConnectionManager` with typed sends using `WsMessageType`/`WsStatus` enums: `send_status`, `send_transcription`, `send_response_chunk`, `send_error`, `send_screen_chunk`, `send_screen_image` |
| `ws/handler.py` | `websocket_endpoint` FastAPI handler. Creates `AgentSession` with language/prompt from query params. Uses `CommandParser` via `create_default_parser()` |
| `ws/session.py` | `AgentSession` class (~192 lines). Pure coordinator: wires `AudioStreamingService` ↔ `ConversationHistory` ↔ LLM/Vision ↔ WebSocket. Accepts optional `audio_service`, `history`, `screen_capture` params for DI/testing |
| `ws/commands.py` | `WsCommand` enum: PAUSE, RESUME, CLEAR, SET_LANGUAGE, SET_PROMPT, CLEAR_PROMPT, CAPTURE_SCREEN. `ParsedCommand` dataclass |
| `ws/command_parser.py` | `CommandParser` with registry-based handler pattern. `ExactMatchHandler` (no-payload commands), `PrefixMatchHandler` (colon-delimited payload). `create_default_parser()` factory |
| `ws/message_types.py` | `WsMessageType` enum (STATUS, TRANSCRIPTION, CHUNK, ERROR, SCREEN_CHUNK, SCREEN_IMAGE) and `WsStatus` enum (CONNECTED, LISTENING, THINKING, RESPONDING, PAUSED, RECONNECTING, CLEARED, CAPTURING, ANALYZING, COMPLETED, PROMPT_SAVED, PROMPT_CLEARED) |
| `audio/capture.py` | PyAudio at 16kHz, 16-bit, mono, 20ms frames. Async capture loop with thread-safe stream access. `start()`/`stop()`/`close()` lifecycle |
| `audio/service.py` | `AudioStreamingService` — owns PyAudio + Deepgram Agent lifecycle. Callback-driven (`on_transcription`, `on_user_started_speaking`, `on_agent_error`). Handles keepalive loop, pause/resume, language restart |
| `agent/deepgram.py` | `DeepgramAgent` class. Wraps Deepgram SDK v7+ Agent API. `nova-3` model. `send_media()` for PCM frames. `keep_alive()` sends keepalive + dummy audio |
| `llm/prompt.py` | Default system prompts for ES/EN. Custom prompt CRUD via `prompts.json` file |
| `llm/protocol.py` | `LLMService` Protocol with `stream_response()` async iterator interface |
| `llm/deepseek.py` | `DeepSeekLLMService` implementing `LLMService`. DeepSeek API, model `deepseek-v4-flash` |
| `llm/nvidia.py` | `NvidiaLLMService` implementing `LLMService`. NVIDIA API (`integrate.api.nvidia.com`), model `google/gemma-3n-e4b-it`. Temperature 0.20, max_tokens 512 |
| `llm/vision.py` | `VisionLLMService` for screen analysis. Aliyun/DashScope endpoint, model `qwen3.6-plus`. `analyze_screen()`, `analyze_multiple_screens()`. Max tokens 16384, temperature 0.60, thinking enabled |
| `screen/capture.py` | Reserved/legacy module (currently empty). Screen capture is implemented in the Tauri Rust layer at `src-tauri/src/lib.rs` |
| `routers/prompts.py` | REST API: `GET /prompt?lang=`, `POST /prompt`, `DELETE /prompt?lang=` |
| `routers/screens.py` | WebSocket: `/api/ws/analyze-screens` accepts JSON with images array + prompt, streams vision analysis chunks. Uses `WsMessageType` enum |

### WebSocket Message Format

All messages follow: `{"type": "...", "data": {...}}` (via `ConnectionManager`) or flat `{"type": "...", ...}` (screen analysis WebSocket, not using `ConnectionManager`).

**Message type enums** (Python: `backend.ws.message_types` — `WsMessageType`, `WsStatus`; TypeScript: `src/constants/ws.ts` — `WS_MESSAGE_TYPE`, `WS_STATUS`):

| Enum | Values |
|---|---|
| `WsMessageType` | `STATUS`, `TRANSCRIPTION`, `CHUNK`, `ERROR`, `SCREEN_CHUNK`, `SCREEN_IMAGE` |
| `WsStatus` | `CONNECTED`, `LISTENING`, `THINKING`, `RESPONDING`, `PAUSED`, `RECONNECTING`, `CLEARED`, `CAPTURING`, `ANALYZING`, `COMPLETED`, `PROMPT_SAVED`, `PROMPT_CLEARED` |

## Environment

- Backend requires in `backend/.env`:
  - `DEEPGRAM_API_KEY` — Deepgram Agent access
  - `NVIDIA_API_KEY` — NVIDIA API for Gemma 3n LLM
  - `DASHSCOPE_API_KEY` — Aliyun/DashScope for Qwen vision analysis
- See `backend/.env.example` for template
- The `.gitignore` ignores `.env` and `backend/.env`

## Global shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+Shift+Space` | Toggle `alwaysOnTop` for the Tauri window |
| `Ctrl+Shift+G` | Toggle ghost mode (click-through) |
| `Ctrl+Shift+C` | Trigger screen capture (emits `capture-screen-shortcut` event) |

Defined in `src-tauri/src/lib.rs`.

## Rust/Tauri notes

- Rust changes in `src-tauri/` require a rebuild of the Tauri binary — the Vite HMR does not cover them
- The `src-tauri/capabilities/default.json` grants `core:default`, `core:window:allow-start-dragging`, `core:window:allow-set-content-protected`, `core:window:allow-set-ignore-cursor-events`, `core:window:allow-set-size`, and `global-shortcut:default` permissions
- `main.rs` sets `windows_subsystem = "windows"` in release mode — console output is suppressed on Windows
- **`macos-private-api`** feature is enabled in `Cargo.toml` — required for transparent windows on macOS
- Window config in `tauri.conf.json`: 730x730 (collapsed), resizable to 1600x730 (expanded), frameless, transparent, always-on-top, centered, visible, CSP disabled
- Static atomic flags: `GHOST_MODE` (default false), `CONTENT_PROTECTED` (default true)
- Commands: `toggle_always_on_top`, `toggle_content_protected`, `set_window_expanded`, `get_stealth_state`

## Other files

- `sugerencias.txt` — Clean Code/SOLID improvement suggestions (Spanish), covers SRP violations, command handler refactoring, conversation history management, type safety, magic strings
- `.vscode/settings.json` — Python interpreter path (Poetry virtualenv), extraPaths for backend analysis
