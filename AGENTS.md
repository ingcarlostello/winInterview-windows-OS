# AGENTS.md

## Architecture

- **Tauri v2 desktop app** (React + TypeScript frontend, Rust shell, Python orchestration backend)
- **Frontend**: `src/` — React 19, Tailwind CSS v4, Zustand, Vite, react-markdown, react-syntax-highlighter
- **Desktop shell**: `src-tauri/` — Rust (window management commands, global shortcuts, ghost mode, content protection)
- **Orchestration backend**: `backend/` — FastAPI + WebSockets, managed via Poetry. Uses Deepgram SDK (nova-3 for ASR), NVIDIA API (Gemma 3n for LLM), DashScope/Aliyun (Qwen for vision analysis)
- The app runs as a transparent, always-on-top overlay (`730×730` collapsed, `1600×730` expanded, frameless) designed to float over Zoom/Meet
- **Flow**: Microphone → PyAudio (16kHz PCM) → streamed to Deepgram Agent (ASR only) → transcription triggers LLM streaming via NVIDIA Gemma → Response chunks via WebSocket → Frontend renders Markdown + code blocks
- **Screen capture**: Tauri command `capture_screen` in `src-tauri/src/lib.rs` uses the `xcap` crate to capture the first monitor, resizes to a max width of 1280 px, encodes as JPEG (quality 75), and returns base64 → stored in Zustand (`screenImages`, max 4) → VisionLLMService (Qwen) analyzes via separate WebSocket
- **Tier system**: Lite/Pro/Ultra plans gate features and quotas. Backend is the authority (`PlanGate`), Zustand is a UI cache (`planSlice`), Rust is a shortcut guardian (`update_plan_permissions`). Plan is passed as `?plan=` WS query param. No auth yet, no DB — in-memory `PlanRepository`, quotas reset per calendar month

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
| `alwaysOnTop` | `boolean` | Window always-on-top state |
| `theme` | `'dark' \| 'glass'` | Visual theme |
| `screenPanelOpen` | `boolean` | Screen panel visibility |
| `screenImage` | `string \| null` | Latest screen capture (base64) |
| `screenImages` | `string[]` | Thumbnail grid (max 4) |
| `screenChunks` | `string[]` | Vision analysis response chunks |
| `isCapturingScreen` | `boolean` | Screen capture in progress |
| `isAnalyzingScreen` | `boolean` | Vision analysis in progress |
| `screenPrompt` | `string` | Custom vision analysis prompt |

Persisted settings: `customPrompts`, `language`, `theme`

Actions: `setStatus`, `setLanguage`, `setTranscription`, `addResponseChunk`, `clearResponse`, `setError`, `incrementQuestionsAnswered`, `setCustomPrompt`, `clearCustomPrompt`, `setShowPromptEditor`, `toggleGhostMode`, `toggleContentProtected`, `setAlwaysOnTop`, `setTheme`, `toggleScreenPanel`, `setScreenImage`, `addScreenImage`, `clearScreenImages`, `addScreenChunk`, `clearScreenChunks`, `setCapturingScreen`, `setAnalyzingScreen`, `setScreenPrompt`, `reset`

### Hooks

**`src/hooks/useWebSocket.ts`**:

- Connects to `ws://localhost:8000/ws?lang=<lang>&plan=<planId>&prompt=<customPrompt>`
- Auto-reconnect with 3-second delay on close
- Message types from backend: `status`, `transcription`, `chunk`, `error`, `cleared`, `prompt_saved`, `prompt_cleared`, `plan_info`, `quota_update`
- Commands sent to backend: `pause`, `resume`, `clear`, `clear_prompt`, `set_language:<lang>`
- On `plan_info` message: calls `setPlanInfo()`, invokes `update_plan_permissions` Tauri command (updates Rust shortcut flags), auto-disables `contentProtected` if plan lacks `invisible_mode` feature
- On `quota_update` message: calls `updateQuota()` in planSlice
- Handles `QUOTA_EXCEEDED` status (pauses with upgrade message) and `FEATURE_BLOCKED` status
- Auto-increments question counter when transitioning from `responding` to `listening`
- Uses `mountedRef` to prevent state updates on unmounted components

**`src/hooks/useTranslation.ts`**:

- Wraps `t()` function from translations, bound to current store language

### i18n

`src/i18n/translations.ts` — 47 keys for ES/EN with parameterized strings (e.g., `{count}`). Exported `t()` function does key lookup + parameter substitution.

### Plan/Tier system

**Frontend** (`src/stores/slices/planSlice.ts`):

- `PlanSlice` with `planInfo`, `setPlanInfo()`, `updateQuota()`, `hasFeature()`, `getQuota()`
- `DEFAULT_PLAN_INFO` exported — Lite plan defaults used before backend confirms (quotas: 2 captures, 2 analyses, 1200s transcription)
- `PlanInfo` type: `{ plan_id, plan_name, features: FeatureFlags, quotas: Record<string, QuotaInfo> }`

**Hooks** (`src/hooks/useFeatureGate.ts`):

- `useFeatureGate(feature)` → `{ allowed, planName }` — checks if current plan allows a feature
- `useQuotaInfo(quotaKey)` → `{ used, limit, remaining, exceeded, planName }` — reads quota usage

**Feature gates in components**:
- `PromptEditor.tsx` — locked state with "Pro" badge when `!custom_prompts`
- `Controls.tsx` — content protection button shows Lock icon when `!invisible_mode`
- `StatusBar.tsx` — Crown icon + plan name badge; ghost/invisible mode badges conditional on plan
- `Overlay.tsx` — `useEffect` auto-disables `contentProtected` when plan lacks `invisible_mode`; shortcut event listeners gated by `canUseGhostMode`/`canUseInvisibleMode`
- `ScreenPanel.tsx` — `MAX_CAPTURES` varies by `simultaneous_captures` feature; `capturesRemaining`/`capturesExceeded` shown; `custom_prompts` gate on textarea + analyze button with "Pro" badge + Lock icon; `?plan=` param on WS URL
- `screenSlice.ts` — `canCaptureScreen()` checks plan features and quota

### Components

| Component | Purpose |
|---|---|
| `App.tsx` | Root — wires `useWebSocket().send` to `Overlay` callbacks. Listens for Tauri `capture-screen-shortcut` event and invokes `capture_screen` command. Invokes `set_window_expanded` Tauri command |
| `Overlay.tsx` | Main layout — header bar (StatusBar + Controls), PromptEditor, Transcription, Response, QuestionCounter, ScreenPanel. Supports `dark` and `glass` themes. Ghost mode styling. Listens for Tauri `ghost-mode-changed`, `content-protected-changed`, `always-on-top-changed` and `pause-resume-shortcut` events. Auto-disables `contentProtected` when plan lacks `invisible_mode` |
| `StatusBar.tsx` | Bot icon, theme toggle (Dark/Liquid), screen reader toggle, language selector, ghost mode badge, content protection badge, always-on-top indicator (Pin/PinOff icon), Crown icon + plan name badge, status dot with pulse animation, microphone icon, error text. Uses `data-tauri-drag-region` for window dragging |
| `Transcription.tsx` | Shows "Entrevistador" label + transcribed text in bordered box. Shows placeholder when no content |
| `Response.tsx` | AI Copilot response area. Uses `react-markdown` + `remark-gfm` + `react-syntax-highlighter` (vscDarkPlus theme). Custom table styling. Blinking cursor (`▎`) during streaming. Three-dot animation while thinking. Copy button |
| `Controls.tsx` | Connect/Listen button (idle/error), connecting spinner, Pause/Resume toggle, End/Disconnect button, content protection toggle (Eye/EyeOff icons). Invokes Tauri `toggle_content_protected` command. Lock icon when `!invisible_mode` |
| `PromptEditor.tsx` | Collapsible editor. Textarea for custom prompt. Save button (triggers reconnect), Restore default button. Shows "Active prompt" indicator. Locked state with "Pro" badge when `!custom_prompts` |
| `QuestionCounter.tsx` | Displays count of answered questions. Hidden when count is 0. Singular/plural handling via translations |
| `LanguageSelector.tsx` | Dropdown selector for ES/EN with flag emojis. Click-outside-to-close behavior. Updates store language and sends WebSocket language change command |
| `ScreenPanel.tsx` | Screen capture analysis panel. Thumbnail grid (max 4 captures). Capture button invokes Tauri `capture_screen` command. WebSocket connection to `ws://localhost:8000/api/ws/analyze-screens` for vision analysis. Prompt textarea for custom analysis instructions. Markdown-rendered solution output with syntax highlighting. Clear button. `custom_prompts` gate on textarea + analyze button with "Pro" badge + Lock icon; `?plan=` param on WS URL |

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
- `PlanGate` per WS connection enforces feature gates and quota consumption; backend is the authority for tier validation
- Transcription quota exceeded → finish current LLM response, then pause with upgrade message

### Modules

| Module | Purpose |
|---|---|
| `config.py` | Pydantic settings: `deepgram_api_key`, `nvidia_api_key`, `dashscope_api_key`, `host`, `port` |
| `tiers.py` | `PlanId` (LITE/PRO/ULTRA), `Feature` (CUSTOM_PROMPTS, SIMULTANEOUS_CAPTURES, SIMULTANEOUS_ANALYSIS, KEYBOARD_SHORTCUTS, INVISIBLE_MODE, GHOST_MODE), `Quota` (TRANSCRIPTION_SECONDS, SCREEN_CAPTURES, SCREEN_ANALYSES) enums. `PlanDefinition` dataclass. `PLANS` dict with per-plan features/quotas. Helper functions: `get_plan()`, `has_feature()`, `get_quota_limit()` |
| `plan_gate.py` | `FeatureBlockedError`, `QuotaExceededError` exceptions. `PlanGate` class: `require_feature()`, `can_use_feature()`, `consume_quota()`, `get_remaining()`, `get_usage_summary()`, `get_plan_info()`. Per-connection in-memory usage tracking |
| `context.py` | `ConversationHistory` — message list management (system prompt + user/assistant messages, max 20, auto-trim). Used by `AgentSession` |
| `dependencies.py` | DI singletons: `get_connection_manager()`, `get_llm_service()` (DeepSeekLLMService), `get_vision_service()` (VisionLLMService) |
| `ws_manager.py` | `ConnectionManager` with typed sends using `WsMessageType`/`WsStatus` enums: `send_status`, `send_transcription`, `send_response_chunk`, `send_error`, `send_screen_chunk`, `send_screen_image` |
| `ws/handler.py` | `websocket_endpoint` FastAPI handler. Creates `AgentSession` with language/prompt from query params. Reads `?plan=` query param, creates `PlanGate`, injects into `AgentSession`. Uses `CommandParser` via `create_default_parser()` |
| `ws/session.py` | `AgentSession` class (~240 lines). Pure coordinator: wires `AudioStreamingService` ↔ `ConversationHistory` ↔ LLM/Vision ↔ WebSocket. Accepts optional `audio_service`, `history` params for DI/testing. `DialogCoordinator` inner class handles business logic with `PlanGate` integration. `_send_plan_info()` on connect. Feature gates on set/clear_prompt |
| `ws/commands.py` | `WsCommand` enum: PAUSE, RESUME, CLEAR, SET_LANGUAGE, SET_PROMPT, CLEAR_PROMPT, CAPTURE_SCREEN. `ParsedCommand` dataclass |
| `ws/command_parser.py` | `CommandParser` with registry-based handler pattern. `ExactMatchHandler` (no-payload commands), `PrefixMatchHandler` (colon-delimited payload). `create_default_parser()` factory |
| `ws/message_types.py` | `WsMessageType` enum (STATUS, TRANSCRIPTION, CHUNK, ERROR, SCREEN_CHUNK, SCREEN_IMAGE, PLAN_INFO, QUOTA_UPDATE) and `WsStatus` enum (CONNECTED, LISTENING, THINKING, RESPONDING, PAUSED, RECONNECTING, CLEARED, CAPTURING, ANALYZING, COMPLETED, PROMPT_SAVED, PROMPT_CLEARED, QUOTA_EXCEEDED, FEATURE_BLOCKED) |
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
| `routers/screens.py` | WebSocket: `/api/ws/analyze-screens` accepts JSON with images array + prompt, streams vision analysis chunks. Uses `WsMessageType` enum. PlanGate per connection; gates SIMULTANEOUS_ANALYSIS and SCREEN_ANALYSES quota |

### WebSocket Message Format

All messages follow: `{"type": "...", "data": {...}}` (via `ConnectionManager`) or flat `{"type": "...", ...}` (screen analysis WebSocket, not using `ConnectionManager`).

**Message type enums** (Python: `backend.ws.message_types` — `WsMessageType`, `WsStatus`; TypeScript: `src/constants/ws.ts` — `WS_MESSAGE_TYPE`, `WS_STATUS`):

| Enum | Values |
|---|---|
| `WsMessageType` | `STATUS`, `TRANSCRIPTION`, `CHUNK`, `ERROR`, `SCREEN_CHUNK`, `SCREEN_IMAGE`, `PLAN_INFO`, `QUOTA_UPDATE` |
| `WsStatus` | `CONNECTED`, `LISTENING`, `THINKING`, `RESPONDING`, `PAUSED`, `RECONNECTING`, `CLEARED`, `CAPTURING`, `ANALYZING`, `COMPLETED`, `PROMPT_SAVED`, `PROMPT_CLEARED`, `QUOTA_EXCEEDED`, `FEATURE_BLOCKED` |

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
| `Ctrl+Shift+Space` | Toggle `alwaysOnTop` for the Tauri window (emits `always-on-top-changed` event) |
| `Ctrl+Shift+G` | Toggle ghost mode (click-through) |
| `Ctrl+Shift+C` | Trigger screen capture (emits `capture-screen-shortcut` event) |
| `Ctrl+Shift+P` | Pause / Resume listening (emits `pause-resume-shortcut` event) |
| `Ctrl+Shift+B` | Toggle content protection (blur) |

Defined in `src-tauri/src/lib.rs`.

## Rust/Tauri notes

- Rust changes in `src-tauri/` require a rebuild of the Tauri binary — the Vite HMR does not cover them
- The `src-tauri/capabilities/default.json` grants `core:default`, `core:window:allow-start-dragging`, `core:window:allow-set-content-protected`, `core:window:allow-set-ignore-cursor-events`, `core:window:allow-set-size`, and `global-shortcut:default` permissions
- `main.rs` sets `windows_subsystem = "windows"` in release mode — console output is suppressed on Windows
- **`macos-private-api`** feature is enabled in `Cargo.toml` — required for transparent windows on macOS
- Window config in `tauri.conf.json`: 730x730 (collapsed), resizable to 1600x730 (expanded), frameless, transparent, always-on-top, centered, visible, CSP disabled
- Static atomic flags: `GHOST_MODE` (default false), `CONTENT_PROTECTED` (default true), `SHORTCUTS_ENABLED` (default false), `INVISIBLE_MODE_ENABLED` (default false), `GHOST_MODE_ENABLED` (default false)
- Window `alwaysOnTop` state is managed via `window.is_always_on_top()` (default true)
- Commands: `toggle_always_on_top`, `toggle_content_protected`, `set_window_expanded`, `get_stealth_state`, `update_plan_permissions`

## Other files

- `sugerencias.txt` — Clean Code/SOLID improvement suggestions (Spanish), covers SRP violations, command handler refactoring, conversation history management, type safety, magic strings
- `.vscode/settings.json` — Python interpreter path (Poetry virtualenv), extraPaths for backend analysis
