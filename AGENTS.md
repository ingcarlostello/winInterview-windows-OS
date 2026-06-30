# AGENTS.md

## Architecture

- **Tauri v2 desktop app** (React + TypeScript frontend, Rust shell, Python orchestration backend)
- **Frontend**: `src/` — React 19, Tailwind CSS v4, Zustand, Vite, react-markdown, react-syntax-highlighter
- **Desktop shell**: `src-tauri/` — Rust (window management commands, global shortcuts, ghost mode, content protection)
- **Orchestration backend**: `backend/` — FastAPI + WebSockets, managed via Poetry. Uses Deepgram SDK (nova-3 for ASR), DeepSeek API (deepseek-v4-flash for LLM), MiniMax (MiniMax-M3 for vision analysis). **Deployed to Railway (cloud), 2026-06-30** — see the *Cloud Deployment (Railway)* section. Runs headless: it no longer captures audio, it only relays client-streamed PCM frames to Deepgram
- The app runs as a transparent, always-on-top overlay (`730×730` collapsed, `1600×730` expanded, frameless) designed to float over Zoom/Meet
- **Flow** (audio capture moved Python → Rust client, 2026-06-30): Rust captures mic (`cpal`) + WASAPI loopback (`wasapi` crate) in `src-tauri/src/audio.rs` → 16kHz mono i16 PCM → base64 over a Tauri `Channel` → JS re-sends as **binary WebSocket frames** → backend `/ws` relays each frame to Deepgram Agent (ASR only) → transcription triggers LLM streaming via DeepSeek → Response chunks via WebSocket → Frontend renders Markdown + code blocks
- **Screen capture**: Tauri command `capture_screen` in `src-tauri/src/lib.rs` uses the `xcap` crate to capture the first monitor, resizes to a max width of 1280 px, encodes as JPEG (quality 75), and returns base64 → stored in Zustand (`screenImages`, max 4). Each successful capture decrements `screen_captures` quota in Convex via `useCaptureQuota`. VisionLLMService (MiniMax-M3) analyzes captures via separate WebSocket
- **Tier system**: Lite/Pro/Ultra plans gate features and quotas. **Convex is the source of truth** for `planId` and quota remaining; the Python backend reads them on every WebSocket connection via `ConvexClient` and enforces limits with `PlanGate`. Zustand (`planSlice`) caches the live state and receives updates from both the backend WebSocket (`PLAN_INFO`/`QUOTA_UPDATE`) and a reactive Convex query (`users.getCurrentUserPlanInfo`). Rust is a shortcut guardian (`update_plan_permissions`). Quotas reset per calendar month. **Paddle** manages subscriptions via webhooks → Convex updates `planId`; users without a subscription are on the `free` tier (3 min transcription trial, 0 captures/analyses).

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
| `planInfo` | `PlanInfo \| null` | Current plan (Pro/Ultra/Free) + features + quotas. **Account-state** — persists across disconnect, cleared only on logout |
| `userKey` | `string \| null` | Desktop access key (`wik_*`), persisted for session resumption |

Persisted settings: `customPrompts`, `language`, `theme`, `audioSource`, `pendingUpgrade`, `userKey`

**Account-state (persists disconnect/reconnect):** `planInfo`, `userKey` — cleared only on logout to prevent showing stale data to next user.

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

**`src/hooks/usePlanSync.ts`**:

- **Key-mode only:** Reactive Convex query (`users.getPlanInfoByUserKey`) seeds `planInfo` into Zustand on app load using the pasted access key
- Provides the initial cross-session source of truth for plan features and quota counters

**`src/hooks/useCaptureQuota.ts`**:

- Exposes `decrementCapture()` to decrement `screen_captures` quota directly in Convex after a Tauri screen capture succeeds

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
- `ScreenPanel.tsx` — `MAX_CAPTURES` varies by `simultaneous_captures` feature; `capturesRemaining`/`capturesExceeded` and `analysesRemaining`/`analysesExceeded` shown; `custom_prompts` gates only the prompt textarea ("Pro" badge + Lock icon); the analyze button is always available while quota remains and uses the default prompt when custom prompts are locked; `thinking_mode` (Ultra-only) gates a thinking toggle (Brain icon + switch) that sends `thinking_enabled` in the WS payload; `?token=` param on WS URL
- `screenSlice.ts` — `canCaptureScreen()` checks plan features and quota

### Components

| Component | Purpose |
|---|---|
| `App.tsx` | Root — **key-mode only (2026-06-27):** checks `if (!userKey)` → renders centered `KeyLoginForm` card (paste key + Enter), else renders `Overlay` (main app). Wires `useWebSocket().send` to `Overlay` callbacks. Listens for Tauri `capture-screen-shortcut` event and invokes `capture_screen` command. Invokes `set_window_expanded` Tauri command. Logout = `disconnect(); clearUserKey()` |
| `Overlay.tsx` | Main layout — header bar (StatusBar + Controls), PromptEditor, Transcription, Response, QuestionCounter, ScreenPanel. Supports `dark` and `glass` themes. Ghost mode styling. Listens for Tauri `ghost-mode-changed`, `content-protected-changed`, `always-on-top-changed` and `pause-resume-shortcut` events. Auto-disables `contentProtected` when plan lacks `invisible_mode` |
| `StatusBar.tsx` | Bot icon, theme toggle (Dark/Liquid), screen reader toggle, language selector, ghost mode badge, content protection badge, always-on-top indicator (Pin/PinOff icon), Crown icon + plan name badge (shows skeleton `animate-pulse` while loading), quota badge (shows skeleton while loading instead of red "0m"), status dot with pulse animation, microphone icon, error text. Uses `data-tauri-drag-region` for window dragging. **Plan badge fix (2026-06-28):** renders skeleton placeholder while `planInfo` is null, preventing the "Free" → real plan flash |
| `Transcription.tsx` | Shows "Entrevistador" label + transcribed text in bordered box. Shows placeholder when no content |
| `Response.tsx` | AI Copilot response area. Uses `react-markdown` + `remark-gfm` + `react-syntax-highlighter` (vscDarkPlus theme). Custom table styling. Blinking cursor (`▎`) during streaming. Three-dot animation while thinking. Copy button |
| `Controls.tsx` | Connect/Listen button (idle/error), connecting spinner, Pause/Resume toggle, End/Disconnect button, content protection toggle (Eye/EyeOff icons). Invokes Tauri `toggle_content_protected` command. Lock icon when `!invisible_mode` |
| `PromptEditor.tsx` | Collapsible editor. Textarea for custom prompt. Save button (triggers reconnect), Restore default button. Shows "Active prompt" indicator. Locked state with "Pro" badge when `!custom_prompts` |
| `QuestionCounter.tsx` | Displays count of answered questions. Hidden when count is 0. Singular/plural handling via translations |
| `LanguageSelector.tsx` | Dropdown selector for ES/EN with flag emojis. Click-outside-to-close behavior. Updates store language and sends WebSocket language change command |
| `AudioSourceSelector.tsx` | Dropdown for mic/system/loopback audio source (Ultra-only). Shows icons + labels + descriptions. Locked with 🔒 badge for non-Ultra plans. Edit-only when disconnected (idle/error). Updates store audio source + sends `?audio_source=` in WebSocket URL |
| `ScreenPanel.tsx` | Screen capture analysis panel. Thumbnail grid (max 4 captures). Capture button invokes Tauri `capture_screen` command. WebSocket connection to `ws://localhost:8000/api/ws/analyze-screens` for vision analysis. Prompt textarea for custom analysis instructions. Markdown-rendered solution output with syntax highlighting. Clear button. `custom_prompts` gate on textarea + analyze button with "Pro" badge + Lock icon; `thinking_mode` (Ultra-only) toggle with Brain icon + animated switch; `?plan=` param on WS URL |

### CSS

- Custom utilities in `src/index.css`: `scrollbar-thin`, `aura-active`, `glass-aura-active`, `glass-aura-idle`, `glass-base`, `glass-button`, `glass-button-active`, `icon-spin`, `dot-pulse-anim`, `ghost-active`
- Keyframe animations: `spin-slow`, `dot-pulse`, `ghost-pulse`
- All user-facing text uses i18n translations (ES/EN)

## Backend

### Dependencies

| Package | Purpose |
|---|---|
| `deepgram-sdk` | Deepgram Agent SDK (nova-3 for ASR only, linear16 encoding, 16kHz, smart_format, endpointing=1500ms) |
| `openai` | OpenAI-compatible client for DeepSeek API and MiniMax |
| `fastapi` | Web framework |
| ~~`sounddevice` / `soundcard` / `numpy`~~ | **REMOVED 2026-06-30.** Audio is now captured client-side in Rust (`src-tauri/src/audio.rs`) and streamed to the backend as binary PCM frames over the WS; the backend only relays to Deepgram. These libs would fail to import on Railway's headless Linux anyway |
| `pydantic-settings` | Configuration management |
| `uvicorn[standard]` | ASGI server |
| `websockets` | WebSocket exception handling |
| `python-dotenv` | Environment variable loading |

### Architecture

**Main app** (`backend/src/backend/main.py`):

- `GET /health` — Returns status and active connection count
- `WebSocket /ws` — Main endpoint with per-connection lifecycle (delegated to `AgentSession`)
- REST routers: `prompts` (CRUD for custom prompts), `screens` (screen capture + analysis)
- CORS middleware — **env-driven allowlist** from `ALLOWED_ORIGINS` with `allow_credentials=False` (updated 2026-06-30; was "allow all origins", which is spec-invalid with credentials). WS handshakes additionally checked via `ws/security.py` (`enforce_ws_origin`)

**Key patterns**:
- Deepgram Agent handles VAD and ASR only (no LLM)
- `AudioStreamingService` encapsulates the full audio pipeline (PyAudio + Deepgram) with callback-based async bridging
- `ConversationHistory` manages the message list with system prompt preservation and auto-trimming at 20 messages
- LLM streaming via DeepSeek API (deepseek-v4-flash) — separate from Deepgram
- Vision analysis via MiniMax (MiniMax-M3) — separate WebSocket endpoint
- Audio captured via PyAudio (16kHz, 16-bit, mono) and streamed directly to Deepgram (no webrtcvad)
- `asyncio.run_coroutine_threadsafe` bridges sync Deepgram callbacks to async event loop
- Agent runs in separate thread to avoid blocking the async WebSocket handler
- Dependency injection via `@lru_cache` singletons in `dependencies.py`
- `AgentSession` constructor accepts optional `audio_service`, `history`, `screen_capture` for test injection
- `CommandParser` uses registry-based handler pattern (open/closed for new commands)
- `PlanGate` per WS connection enforces feature gates and quota consumption; backend is the authority for tier validation
- On every WebSocket connection the backend loads the user's `planId` and current quota remaining from Convex, so in-memory usage starts from the real persisted state
- After each LLM response and on disconnect, `PlanGate` flushes consumed quota to Convex and the backend sends an updated `PLAN_INFO` message
- Transcription quota exceeded → finish current LLM response, then pause with upgrade message
- When quota expires automatically via timer (`_expire_session`), remaining seconds are consumed and flushed to Convex immediately before pausing — no need to wait for disconnect

### Modules

| Module | Purpose |
|---|---|
| `config.py` | Pydantic settings: `deepgram_api_key`, `deepseek_api_key`, `minimax_api_key`, `clerk_jwks_url`, `host`, `port`; plus (2026-06-30) `app_env`, `allowed_origins` (comma-separated CORS + WS-Origin allowlist, exposed via the `allowed_origins_list` property), `enforce_ws_origin` |
| `tiers.py` | `PlanId` (FREE/LITE/PRO/ULTRA), `Feature` (CUSTOM_PROMPTS, SIMULTANEOUS_CAPTURES, SIMULTANEOUS_ANALYSIS, KEYBOARD_SHORTCUTS, INVISIBLE_MODE, GHOST_MODE, THINKING_MODE, SYSTEM_AUDIO_CAPTURE, SIMULTANEOUS_AUDIO), `Quota` (TRANSCRIPTION_SECONDS, SCREEN_CAPTURES, SCREEN_ANALYSES) enums. `PlanDefinition` dataclass. `PLANS` dict with per-plan features/quotas. Helper functions: `get_plan()`, `has_feature()`, `get_quota_limit()`. **Ultra-only**: `SYSTEM_AUDIO_CAPTURE` (loopback WASAPI) and `SIMULTANEOUS_AUDIO` (mic+loopback mixed) |
| `convex_client.py` | Authenticated HTTP client for the Python backend to call Convex HTTP actions (`/api/users/get`, `/api/quotas/decrement`) |
| `plan_gate.py` | `FeatureBlockedError`, `QuotaExceededError` exceptions. `PlanGate` class: initializes usage from Convex remaining, enforces feature/quotas in-memory, and flushes consumption to Convex via `ConvexClient` |
| `context.py` | `ConversationHistory` — message list management (system prompt + user/assistant messages, max 20, auto-trim). Used by `AgentSession` |
| `dependencies.py` | DI singletons: `get_connection_manager()`, `get_llm_service()` (DeepSeekLLMService), `get_vision_service()` (VisionLLMService) |
| `ws_manager.py` | `ConnectionManager` with typed sends using `WsMessageType`/`WsStatus` enums: `send_status`, `send_transcription`, `send_response_chunk`, `send_error`, `send_screen_chunk`, `send_screen_image` |
| `ws/handler.py` | `websocket_endpoint` FastAPI handler. Verifies Clerk JWT from `?token=` (with 10s leeway tolerance for clock skew), fetches plan/quotas from Convex via `ConvexClient`, creates `PlanGate`, and injects into `AgentSession`. Language/prompt/`audio_source` come from query params. Silently enforces `audio_source="mic"` if plan lacks `SYSTEM_AUDIO_CAPTURE`/`SIMULTANEOUS_AUDIO` features (same pattern as `thinking_mode`). Uses `CommandParser` via `create_default_parser()`. **2026-06-30:** the receive loop now uses `await websocket.receive()` — **text** messages → `CommandParser`; **binary** messages → `session.feed_audio(data)` (client-streamed audio → Deepgram). Calls `is_ws_origin_allowed()` (from `ws/security.py`) after `accept()` to check the `Origin` header against `allowed_origins` |
| `ws/security.py` | **New 2026-06-30.** `is_ws_origin_allowed(websocket, session_id)` — logs the WS `Origin` header and, when `settings.enforce_ws_origin` is `true`, rejects connections whose `Origin` is present and not in `allowed_origins_list` (no-Origin native clients pass). Defense-in-depth on top of the opaque-key auth; used by both `ws/handler.py` and `routers/screens.py` |
| `ws/session.py` | `AgentSession` class (~240 lines). Pure coordinator: wires `AudioStreamingService` ↔ `ConversationHistory` ↔ LLM/Vision ↔ WebSocket. Accepts optional `audio_service`, `history`, `audio_source` params for DI/testing. `DialogCoordinator` inner class handles business logic with `PlanGate` integration. `_send_plan_info()` on connect and after each flush. Feature gates on set/clear_prompt. Logs audio source choice on session start. **2026-06-30:** exposes `feed_audio(data)` which delegates client-streamed audio frames to `AudioStreamingService.feed_audio()` |
| `ws/commands.py` | `WsCommand` enum: PAUSE, RESUME, CLEAR, SET_LANGUAGE, SET_PROMPT, CLEAR_PROMPT, CAPTURE_SCREEN. `ParsedCommand` dataclass |
| `ws/command_parser.py` | `CommandParser` with registry-based handler pattern. `ExactMatchHandler` (no-payload commands), `PrefixMatchHandler` (colon-delimited payload). `create_default_parser()` factory |
| `ws/message_types.py` | `WsMessageType` enum (STATUS, TRANSCRIPTION, CHUNK, ERROR, SCREEN_CHUNK, SCREEN_IMAGE, PLAN_INFO, QUOTA_UPDATE) and `WsStatus` enum (CONNECTED, LISTENING, THINKING, RESPONDING, PAUSED, RECONNECTING, CLEARED, CAPTURING, ANALYZING, COMPLETED, PROMPT_SAVED, PROMPT_CLEARED, QUOTA_EXCEEDED, FEATURE_BLOCKED) |
| `audio/capture.py` | **Gutted to a docstring stub 2026-06-30** — the old `AudioCapture`/`SystemAudioCapture`/`MixedAudioCapture` classes (sounddevice/soundcard) were removed. Capture now lives client-side in Rust (`src-tauri/src/audio.rs`): cpal mic + `wasapi` loopback + averaging resampler + int32 anti-clip mix |
| `audio/service.py` | `AudioStreamingService` — **no longer owns capture** (2026-06-30); manages only the Deepgram Agent lifecycle. `feed_audio(frame: bytes)` relays a client-captured 16 kHz mono i16 PCM frame to Deepgram (respecting pause/closed state). Callback-driven (`on_transcription`, `on_user_started_speaking`, `on_agent_error`). Handles keepalive loop, pause/resume, language restart |
| `agent/deepgram.py` | `DeepgramAgent` class. Wraps Deepgram SDK v7+ Agent API. `nova-3` model. `send_media()` for PCM frames. `keep_alive()` sends keepalive + dummy audio |
| `llm/prompt.py` | Default system prompts for ES/EN. Custom prompt CRUD via `prompts.json` file |
| `llm/protocol.py` | `LLMService` Protocol with `stream_response()` async iterator interface |
| `llm/deepseek.py` | `DeepSeekLLMService` implementing `LLMService`. DeepSeek API, model `deepseek-v4-flash` |
| `llm/vision.py` | `VisionLLMService` for screen analysis. MiniMax endpoint (`https://api.minimax.io/v1`), model `MiniMax-M3`. `analyze_multiple_screens()`. Max_completion_tokens 16384, temperature 1.0, `thinking_enabled` parameter controls `extra_body={"thinking": {"type": "adaptive"|"disabled"}}` |
| `screen/capture.py` | Reserved/legacy module (currently empty). Screen capture is implemented in the Tauri Rust layer at `src-tauri/src/lib.rs` |
| `routers/prompts.py` | REST API: `GET /prompt?lang=`, `POST /prompt`, `DELETE /prompt?lang=` |
| `routers/screens.py` | WebSocket: `/api/ws/analyze-screens` accepts `?token=`, verifies the Clerk JWT, fetches plan/quotas from Convex, then receives JSON with images array + prompt + `thinking_enabled` and streams vision analysis chunks. Uses `WsMessageType` enum. `PlanGate` per connection; gates `SIMULTANEOUS_ANALYSIS`, `THINKING_MODE`, and `SCREEN_ANALYSES` quota; silently forces `thinking_enabled=false` if plan lacks `THINKING_MODE`; flushes consumption to Convex on close |

### WebSocket Message Format

All messages follow: `{"type": "...", "data": {...}}` (via `ConnectionManager`) or flat `{"type": "...", ...}` (screen analysis WebSocket, not using `ConnectionManager`).

**Message type enums** (Python: `backend.ws.message_types` — `WsMessageType`, `WsStatus`; TypeScript: `src/constants/ws.ts` — `WS_MESSAGE_TYPE`, `WS_STATUS`):

| Enum | Values |
|---|---|
| `WsMessageType` | `STATUS`, `TRANSCRIPTION`, `CHUNK`, `ERROR`, `SCREEN_CHUNK`, `SCREEN_IMAGE`, `PLAN_INFO`, `QUOTA_UPDATE` |
| `WsStatus` | `CONNECTED`, `LISTENING`, `THINKING`, `RESPONDING`, `PAUSED`, `RECONNECTING`, `CLEARED`, `CAPTURING`, `ANALYZING`, `COMPLETED`, `PROMPT_SAVED`, `PROMPT_CLEARED`, `QUOTA_EXCEEDED`, `FEATURE_BLOCKED` |

## Environment

- Frontend requires `.env.local` in project root:
  - `VITE_CLERK_PUBLISHABLE_KEY` — Clerk publishable key (`pk_test_...`)
  - `VITE_CONVEX_URL` — Convex deployment URL (`https://<deployment>.convex.cloud`)
  - `CONVEX_DEPLOYMENT` — Deployment slug used by Convex CLI (`dev:<deployment-name>`)
- Backend requires `backend/.env`:
  - `DEEPGRAM_API_KEY` — Deepgram Agent access
  - `MINIMAX_API_KEY` — MiniMax for MiniMax-M3 vision analysis
  - `DEEPSEEK_API_KEY` — DeepSeek LLM access
  - `CLERK_SECRET_KEY` — Clerk secret key (`sk_test_...`) for JWT verification
  - `CONVEX_BACKEND_KEY` — Backend-to-Convex authentication key
- See `backend/.env.example` for template
- The `.gitignore` ignores `.env`, `.env.local`, and `backend/.env`
- **Active Convex deployment** (Windows dev): `dev:qualified-cuttlefish-550` → `https://qualified-cuttlefish-550.convex.cloud`

## Cloud Deployment (Railway) — shipped 2026-06-30

The Python backend is deployed to **Railway**; the desktop connects over WSS. **Zero secrets ship in the client** — all real API keys are Railway service vars. Full operational runbook in `DEPLOYMENT.md`.

### Backend service

- **Project** `winInterview-backend` (`1f45c442-eeb0-4cc3-ba33-2e94605419f1`), env `production` (`fca07bc7-…`), service **`api`** (`0455986b-…`).
- Builds from **`backend/Dockerfile`** (`python:3.14-slim` + Poetry, installs from `poetry.lock`) with **Root Directory = `backend`** and `backend/railway.json` (builder=DOCKERFILE, `healthcheckPath: /health`, restart ON_FAILURE). `backend/.dockerignore` excludes `.env*`/`.venv`/`.git`. CMD binds `0.0.0.0:${PORT}` (Railway injects `PORT`).
- Tracks the **`main`** branch — pushes to `main` auto-deploy. (Originally `feat/deploy-backend-to-railway`, merged via PR #9.)
- **URLs:** `https://api-production-d6a6.up.railway.app` + custom domain **`https://api-dev.wininterview.xyz`** (valid TLS).
- **Service env vars:** `DEEPGRAM_API_KEY`, `DEEPSEEK_API_KEY`, `MINIMAX_API_KEY`, `CONVEX_BACKEND_KEY`, `VITE_CONVEX_URL` (dev Convex), `APP_ENV=dev`, `ALLOWED_ORIGINS=http://tauri.localhost,tauri://localhost,http://localhost:5173`, `ENFORCE_WS_ORIGIN=false` (log-only; flip to `true` after confirming the real Tauri Origin — observed dev = `http://localhost:5173`, prod build = `http://tauri.localhost`).
- **Validated end-to-end** against Convex dev: key auth → plan load → Deepgram transcription → DeepSeek + MiniMax vision, all `200`.

### Build-time backend URL (never hardcoded)

The desktop reads `VITE_BACKEND_WS_URL` per Vite mode (`useWebSocket.ts`, `ScreenPanel.tsx`): `.env.development`→`ws://localhost:8000`, `.env.staging`→`wss://api-dev.wininterview.xyz`, `.env.production`→`wss://api.wininterview.xyz` (these three are **committed — public values only**). `npm run tauri build` bakes `.env.production`; build in `staging` mode for a dev-backend installer. A gitignored `.env.development.local` can override the dev URL to test `npm run tauri dev` against the cloud.

### Custom domain on Railway (private project gotcha)

A custom domain on a **private** Railway project needs **two** DNS records (Settings → Networking → Custom Domain shows both): a **CNAME** (`api-dev` → a `*.up.railway.app` target) **and** a **`_railway-verify.<sub>` TXT** ownership record. **Missing the TXT = the TLS cert never issues** (this bit us for ~30 min). DNS for `wininterview.xyz` is at **Hostinger** (manage via the Hostinger DNS MCP, or the API directly with `${HOSTINGER_API_TOKEN}`). Do **not** use `railway-agent` for domains — it omits the TXT and churns the domain list; use the dashboard.

### Installer + auto-updater (scaffolded, NOT yet operational)

`src-tauri/src/audio.rs`, `src/hooks/useUpdater.ts`, NSIS/MSI + `createUpdaterArtifacts` in `tauri.conf.json`, `updates-server/` (Railway-hosted manifest + token-guarded `/publish`), and `.github/workflows/release.yml` (tag-triggered on `v*`) all exist; `cargo check` passes. **Pending:** generate the minisign updater key (`plugins.updater.pubkey` is a placeholder) and deploy `updates-server`.

### Prod — LIVE (2026-06-30)

The full prod stack is provisioned and validated at the infra level (`https://api.wininterview.xyz/health` → 200 over HTTPS, clean startup, no Convex errors).

- **Railway prod env** `prod` (`74143a76-d840-43fd-ab91-8685329311f3`) in the same `winInterview-backend` project, service **`attractive-smile`** (`1d7d17dc-…`). Railway's "new environment" created a **blank** service (it did NOT fork `api`), so its source (`ingcarlostello/winInterview-windows-OS` @ `main`, root `backend`, Dockerfile, `/health`) and 8 env vars were set by hand. Custom domain **`https://api.wininterview.xyz`** (valid TLS via CNAME `api`→`3jyq052d.up.railway.app` + TXT `_railway-verify.api`, both at Hostinger). Prod vars: reused `DEEPGRAM/DEEPSEEK/MINIMAX` keys, `VITE_CONVEX_URL=https://unique-jaguar-230.convex.cloud`, `CONVEX_BACKEND_KEY` **matching Convex prod**, `APP_ENV=prod`, `ALLOWED_ORIGINS=http://tauri.localhost,tauri://localhost`, `ENFORCE_WS_ORIGIN=false`.
- **Convex prod** (`unique-jaguar-230`): 10 env vars + functions deployed via the Convex CLI with a **prod deploy key** (the Convex MCP is read-only on prod). `APP_ENV=live`, `CLERK_ISSUER_URL=https://clerk.wininterview.xyz`, `CLERK_WEBHOOK_SIGNING_SECRET`, `CONVEX_BACKEND_KEY`, `PADDLE_API_KEY` (live), `PADDLE_API_URL=https://api.paddle.com`, `PADDLE_WEBHOOK_SECRET` (live), `PADDLE_PRICE_LITE/PRO/ULTRA` (live `pri_…`).
- **Clerk prod**: instance live (domain `clerk.wininterview.xyz`, DNS + SSL set, JWT template `convex` present); webhook → `https://unique-jaguar-230.convex.site/api/webhooks/clerk`. **Paddle live**: product + 3 prices live; webhook → `https://unique-jaguar-230.convex.site/api/webhooks/paddle`.
- **`auth.config.ts` issuer bug FIXED** — now env-driven (`process.env.CLERK_ISSUER_URL`); same fix in `webhooks.ts` `tokenIdentifier`. Committed in `main` (`13361a0`).
- **railway-agent caveat (extended beyond domains):** its `commitStagedChangesTool` errors `root: Required` and it spawned a stray duplicate service — it stages but cannot commit. **Commit staged changes from the Railway dashboard** ("Apply N changes / Deploy").
- **Pending:** flip `ENFORCE_WS_ORIGIN=true` after confirming the prod Tauri Origin in logs; run the real audio→LLM→vision E2E with a `wik_live_` key; installer + auto-updater still scaffolded-only.

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
- The `src-tauri/capabilities/default.json` grants `core:default`, `core:window:allow-start-dragging`, `core:window:allow-set-content-protected`, `core:window:allow-set-ignore-cursor-events`, `core:window:allow-set-size`, `core:window:allow-close`, `core:window:allow-minimize`, `global-shortcut:default`, and (2026-06-30) `updater:default` + `process:allow-restart` permissions
- `main.rs` sets `windows_subsystem = "windows"` in release mode — console output is suppressed on Windows
- **`macos-private-api`** feature is enabled in `Cargo.toml` — required for transparent windows on macOS
- Window config in `tauri.conf.json`: 730x730 (collapsed), resizable to 1600x730 (expanded), frameless, transparent, always-on-top, centered, visible, CSP disabled
- Static atomic flags: `GHOST_MODE` (default false), `CONTENT_PROTECTED` (default true), `SHORTCUTS_ENABLED` (default false), `INVISIBLE_MODE_ENABLED` (default false), `GHOST_MODE_ENABLED` (default false)
- Window `alwaysOnTop` state is managed via `window.is_always_on_top()` (default true)
- Commands: `toggle_always_on_top`, `toggle_content_protected`, `set_window_expanded`, `get_stealth_state`, `update_plan_permissions`, `capture_screen`, `open_url`, and (2026-06-30) `start_audio` / `stop_audio` (client-side audio capture)
- **Audio capture (`src-tauri/src/audio.rs`, new 2026-06-30):** cpal mic + `wasapi` loopback (Windows) + averaging resampler + int32 anti-clip mix → 16 kHz mono i16 PCM (640-byte / 20 ms frames) → base64 over a Tauri `Channel` → JS sends as binary WS frames. New Cargo deps: `cpal`, `wasapi` (Windows-only), `tauri-plugin-updater`, `tauri-plugin-process`; `rust-version` bumped 1.77 → 1.82. **Installer/updater:** `tauri.conf.json` bundles NSIS + MSI with `createUpdaterArtifacts: true` (nsis `installMode: "currentUser"`) and a signed auto-updater (`plugins.updater` + `src/hooks/useUpdater.ts`). `cargo check` passes (toolchain 1.96, `wasapi` resolved 0.15)

## Authentication (Clerk + Convex)

The app uses **Clerk** for identity management and **Convex** for user data persistence.

### Architecture

- **Clerk** handles user registration, login, and JWT issuance
- **Convex** stores user profiles, quotas, and prompts (schema in `convex/schema.ts`)
- **Dual sync paths** ensure users exist in Convex:
  - **Client-side** (`EnsureConvexUser.tsx`): Runs when user signs in via the Tauri app, calls `storeUser()` mutation
  - **Server-side webhook** (`convex/webhooks.ts`): Clerk sends `user.created`/`user.updated`/`user.deleted` events to Convex

### Clerk Configuration

**Dashboard setup required:**

1. **JWT Template**: Create a template named `convex` with claims `{"aud": "convex"}` (required for `ctx.auth.getUserIdentity()` to work)
2. **Webhook**: Add endpoint `https://<deployment>.convex.site/api/webhooks/clerk` with events:
   - `user.created`
   - `user.updated`
   - `user.deleted`

**Environment variables:**

- **Frontend** (`.env.local` in project root):
  - `VITE_CLERK_PUBLISHABLE_KEY` — Clerk publishable key (`pk_test_...`)
  - `VITE_CONVEX_URL` — Convex deployment URL
  - `CONVEX_DEPLOYMENT` — Convex CLI deployment slug (e.g. `dev:qualified-cuttlefish-550`)
- **Backend** (`backend/.env`):
  - `CLERK_SECRET_KEY` — Clerk secret key (`sk_test_...`) for JWT verification in Python
- **Convex** (set via `npx convex env set`):
  - `CLERK_WEBHOOK_SIGNING_SECRET` — Webhook signing secret (whsec_...)
  - `CONVEX_BACKEND_KEY` — Backend-to-Convex authentication key

### User Sync Flow

```
Clerk (Identity Provider)
    ↓
    ├─→ Browser (JWT) → React App → EnsureConvexUser → storeUser() mutation
    │
    └─→ Webhook Event → POST /api/webhooks/clerk → createUserFromClerk() mutation
```

Both paths are **idempotent** — whichever runs first creates the user, the second finds the existing record.

### Convex Schema

**`users` table** (`convex/schema.ts`):
- `clerkId` — Clerk user ID (subject claim)
- `email`, `name`, `imageUrl` — User profile (optional)
- `planId` — Subscription tier: `"lite"`, `"pro"`, or `"ultra"`
- `tokenIdentifier` — Format: `https://<clerk-domain>|<clerkId>`
- Indexes: `by_token` (tokenIdentifier), `by_clerk_id` (clerkId)

**Related tables:**
- `quotas` — Monthly quota tracking per user (indexed by `userId` + `month`)
- `prompts` — Custom prompts per user per language (indexed by `userId` + `lang`)

### Key Files

| File | Purpose |
|---|---|
| `convex/auth.config.ts` | Clerk JWT issuer for Convex auth — **env-driven** (`process.env.CLERK_ISSUER_URL ?? <dev fallback>`) so dev/prod each use their own issuer (2026-06-30) |
| `convex/users.ts` | User CRUD: `storeUser`, `getCurrentUser`, `updateUserPlan`, `createUserFromClerk`, `updateUserFromClerk`, `deleteUserByClerkId` |
| `convex/webhooks.ts` | Clerk webhook handler (verifies Svix signature) + backend quota decrement |
| `convex/http.ts` | HTTP router for webhook and quota endpoints |
| `src/components/EnsureConvexUser.tsx` | Client-side user sync (5 retries with 1.5s delay) |
| `src/providers/AuthProvider.tsx` | React providers: `ClerkProvider` + `ConvexProviderWithClerk` |

### Webhook Signature Verification

The webhook handler (`convex/webhooks.ts`) verifies Clerk's Svix signatures:
- Reads `svix-id`, `svix-timestamp`, `svix-signature` headers
- Decodes `CLERK_WEBHOOK_SIGNING_SECRET` (strips `whsec_` prefix if present)
- Verifies HMAC-SHA256 signature using Web Crypto API
- If secret not set, logs warning and skips verification (dev mode)

### Backend Integration

The Python backend (`backend/src/backend/auth/clerk.py`) independently verifies Clerk JWTs:
- Uses `PyJWKClient` pointed at Clerk's JWKS endpoint
- `verify_clerk_token()` decodes RS256 JWTs, extracts `clerk_id`
- Used in WebSocket handler to initialize `PlanGate` for in-memory quota tracking
- Backend can call `POST /api/quotas/decrement` on Convex (authenticated via `CONVEX_BACKEND_KEY`)

## Billing (Paddle)

The app uses **Paddle** for subscription billing. Paddle manages checkout, payment, and subscription lifecycle via webhooks to Convex. Self-service portal lets users upgrade/downgrade, preview changes, cancel, and reactivate via actions.

### Architecture

- **Paddle** handles checkout (hosted), payment processing, and subscription lifecycle
- **Convex** receives webhooks from Paddle and updates `users.planId` + paddle fields
- The `free` tier is the default for users without a subscription (3 min transcription, 0 captures/analyses)
- Lite/Pro/Ultra are paid tiers ($4.99/$19.99/$59.99 monthly) — subscription required to unlock
- **Plan changes** (upgrade/downgrade):
  - **Upgrade** (rank increases) → immediate with prorated charge (`proration_billing_mode: "prorated_immediately"`)
  - **Downgrade** (rank decreases) → scheduled for end of billing period (`proration_billing_mode: "do_not_bill"`); user keeps current high plan until `pendingPlanEffectiveAt`; backend stores `pendingPlanId` to apply later
  - **Cancellation** → scheduled for end of period (`scheduled_change: { action: "cancel" }`); user keeps access until effective date
- **Webhook idempotence** → each Paddle `event_id` checked against `subscriptionEvents` table; deduped events return 200 without reprocessing
- **Cron backstop** → daily `applyDuePendingDowngrades` task applies downgrades past their effective date (fallback if renewal webhook misses)

### Paddle Configuration

**Dashboard setup required:**

1. **Product**: "Interview Responder" (tax_category: `saas`)
2. **Prices**: 3 monthly recurring prices with `custom_data.plan_id` set to `"lite"`, `"pro"`, `"ultra"`
3. **Notification setting**: URL `https://<deployment>.convex.site/api/webhooks/paddle` with subscription events

**Environment variables:**

- **Convex** (set via `npx convex env set`):
  - `PADDLE_API_KEY` — Paddle API key for server-side calls (create transactions, find/create customers)
  - `PADDLE_WEBHOOK_SECRET` — Webhook signing secret (`endpoint_secret_key` from notification setting)
  - `PADDLE_API_URL` — API base URL (default: `https://sandbox-api.paddle.com` for sandbox)
  - `PADDLE_PRICE_LITE` / `PADDLE_PRICE_PRO` / `PADDLE_PRICE_ULTRA` — Override sandbox price IDs (optional; sandbox IDs are hardcoded as fallback)

### Subscription Flow

```
Frontend (PricingModal) → useCheckout → Convex action: paddle.createCheckout
    → Paddle: transactions.create (with custom_data.clerk_id + plan_id)
    → Returns checkout.url → Tauri open_url command opens browser
    → User pays → Paddle fires webhook
    → POST /api/webhooks/paddle (Convex httpAction)
    → Verifies Paddle-Signature (HMAC-SHA256, ts;h1 format)
    → Extracts clerk_id from custom_data, plan_id from price.custom_data
    → internal.users.applySubscription → updates planId + quotas + paddle fields
    → getCurrentUserPlanInfo (reactive) → planSlice → features unlocked
```

### Webhook Events Handled

| Event | Action |
|---|---|
| `subscription.activated` | Set plan from price.custom_data.plan_id |
| `subscription.updated` | Update plan; capture `scheduled_change` (cancel/pause/resume programmed), detect downgrades (store `pendingPlanId` + `pendingPlanEffectiveAt` if lowering rank) |
| `subscription.created` | Store subscription data |
| `subscription.canceled` | Revert to `free` |
| `subscription.past_due` | Revert to `free` |
| `subscription.paused` | Revert to `free` |
| `subscription.resumed` | Restore plan from price.custom_data.plan_id |
| `transaction.completed` | Backup confirmation — set plan |
| `transaction.payment_failed` | Log warning |
| *(all events)* | Record `event_id` in `subscriptionEvents` table for idempotence + audit trail |

### Convex Schema (Paddle fields on `users`)

- `paddleCustomerId` — Paddle customer ID (`ctm_...`)
- `paddleSubscriptionId` — Paddle subscription ID (`sub_...`)
- `paddleStatus` — `active` | `canceled` | `past_due` | `paused`
- `paddleCancelUrl` — Management URL for cancellation
- `paddleUpdatePaymentUrl` — Management URL for payment method update
- `subscriptionCurrentPeriodEnd` — Current billing period end date
- `subscriptionScheduledChangeAction` — Paddle's native `scheduled_change.action` (e.g., `"cancel"`, `"pause"`) or `undefined` if none
- `subscriptionScheduledChangeEffectiveAt` — When the scheduled change takes effect (ISO string)
- `pendingPlanId` — App-managed downgrade: plan to apply at end of period (e.g., `"lite"` if user had `"pro"`)
- `pendingPlanEffectiveAt` — When the pending downgrade applies (ISO string, = end of current billing period)
- Indexes: `by_paddle_customer`, `by_paddle_subscription`, `by_pending_effective` (for cron backstop)

**`subscriptionEvents` table** (audit + idempotence):
- `userId` — Link to user (optional)
- `paddleEventId` — Unique event ID from Paddle (dedupe key)
- `eventType` — Event type (e.g., `subscription.updated`)
- `occurredAt` — When Paddle generated the event (ISO string)
- `raw` — Full webhook payload (optional)
- Indexes: `by_event_id` (dedupe), `by_user`

### Key Files

| File | Purpose |
|---|---|
| `convex/paddle.ts` | **Webhook:** `paddleWebhook` httpAction (verifies signature, dedupe check, event processing); **Checkout:** `createCheckout` action; **Self-service:** `changeSubscriptionPlan` (upgrade/downgrade with prorrateo), `previewSubscriptionChange` (read-only), `cancelSubscription` (schedule cancel), `reactivateSubscription` (undo cancel during grace), `updatePaymentMethod` (get transaction ID for Paddle.js overlay) |
| `convex/crons.ts` | `applyDuePendingDowngrades` scheduled task (runs daily, applies downgrades past their effective date — backstop if renewal webhook misses) |
| `convex/http.ts` | Registers `/api/webhooks/paddle` and existing routes |
| `convex/users.ts` | `applySubscription` (internalMutation — only way to change planId); `setPendingPlanChange`, `clearPendingPlanChange`, `applyDuePendingDowngrades` (manage downgrades); `isEventProcessed`, `recordSubscriptionEvent` (dedupe + audit); `getCurrentUserSubscription` query (returns subscription state + scheduled/pending changes) |
| `convex/constants.ts` | `PlanId` includes `free`, `PLAN_QUOTAS`, `PLAN_FEATURES` (includes `thinking_mode` for Ultra), `PLAN_PRICES_USD`, `PLAN_RANK` (determines upgrade vs downgrade direction) |
| `src/hooks/useCheckout.ts` | Calls `createCheckout` action, opens checkout URL via Tauri `open_url` command |
| `src/components/PricingModal.tsx` | 3-tier pricing UI, subscribe buttons, subscription management (cancel/update payment via management_urls) |
| `src/components/StatusBar.tsx` | Crown badge opens PricingModal |
| `src-tauri/src/lib.rs` | `open_url` command — opens external URLs in system browser (cross-platform) |

### Security

- **`updateUserPlan` was converted to `internalMutation` (`applySubscription`)** — the ONLY way to change `planId` is through the Paddle webhook. Previously it was a public mutation (security vulnerability).
- **Webhook idempotence** — each Paddle `event_id` recorded in `subscriptionEvents` table; duplicate events return 200 without reprocessing (guards against replay, network retries)
- **Webhook signature verification** uses HMAC-SHA256 with `Paddle-Signature` header (`ts` + `h1` format)
- Timestamp tolerance: 5 minutes (anti-replay)
- `createCheckout` action requires authenticated Clerk identity
- `changeSubscriptionPlan`, `cancelSubscription`, `reactivateSubscription` require authenticated Clerk identity
- `PADDLE_API_KEY` is server-side only (Convex env, never exposed to frontend)

### Paddle Sandbox IDs (dev)

- Product: `pro_01kvc6na730nwkyafndw2dpa3n`
- Price Lite: `pri_01kvc6na8fharg06tas9cb5da4`
- Price Pro: `pri_01kvc6na9wsxctyp9291jtmer6`
- Price Ultra: `pri_01kvc6nab71h76fpdcx203wkag`
- Notification setting: `ntfset_01kvc6nn781ktgwfd8n5sqrqfd`

## Model Context Protocol (MCP) Servers

Claude Code can access these external services via MCP for development:

| Server | Type | Purpose | Auth |
|---|---|---|---|
| **Convex** | Local | Backend database, HTTP actions, mutations, queries | Project auth (via `convex env`) |
| **Clerk** | Remote | User identity, JWT verification, user management | Built-in |
| **Paddle Sandbox** | Remote | Testing subscriptions, billing flows | `PADDLE_SANDBOX_API_KEY` env var |
| **Paddle Live** | Remote | Production subscriptions (read-only in dev) | `${PADDLE_LIVE_API_KEY}` env var |
| **Railway** | Remote | Deploy/manage/debug the cloud backend (projects, services, deploys, logs, `railway-agent`) | Account auth |
| **Hostinger** (split: `hostinger-dns`/`-domains`/`-hosting`/`-billing`/`-reach`) | Local (stdio) | Manage `wininterview.xyz` DNS + domains/hosting/billing | `${HOSTINGER_API_TOKEN}` env var |

**Configuration**: `.mcp.json` (project root, **committed**) — MCPs auto-load when Claude Code starts. **Secrets in `.mcp.json` are `${VAR}` env-var references ONLY** (`${PADDLE_LIVE_API_KEY}`, `${HOSTINGER_API_TOKEN}`) — never literals, since the file is public. A live Paddle key and a Hostinger token were each committed literally once (both since rotated). Changing the env var requires a Claude Code restart to take effect. **Railway `railway-agent` caveat:** unreliable for custom-domain ops (omits the verification TXT, churns the domain list) — add domains via the Railway dashboard instead.

### Using MCP in Claude Code

- **Convex**: Use MCP to read/write data, inspect schema, run HTTP actions
- **Clerk**: Inspect user records, verify JWT claims, test webhooks
- **Paddle**: Test subscription flows, preview pricing, inspect transactions

---

## System Audio Capture (Windows, Ultra-only)

> **⚠️ MOVED TO RUST (2026-06-30).** The detail below describes the *original Python* capture (`sounddevice`/`soundcard`/`numpy`). Audio capture now runs **client-side in Rust** (`src-tauri/src/audio.rs`: cpal mic + `wasapi` loopback + averaging resampler + int32 anti-clip mix) and is streamed to the backend as binary PCM frames over the WS — the backend no longer captures audio (so it can run headless on Railway). The **three modes, plan gating, and frontend UX below still apply**; only the capture *location* changed (Python → Rust client). Kept for design/historical context.

### Overview

The app can now capture **system audio (WASAPI loopback)** on Windows for Ultra-plan users, enabling high-quality transcription of the interviewer's voice even when using headphones.

### Architecture

**Problem solved**: Microphone-only capture fails with headphones — the interviewer's voice reaches the headphones but never enters the microphone. System audio loopback captures the **digital stream** before it plays, regardless of output device.

**Three capture modes** (via `audio_source` query param):
1. **`"mic"`** (default, all plans) — Microphone only, 16kHz mono via `sounddevice` + `AudioCapture`
2. **`"system"`** (Ultra-only) — Windows WASAPI loopback via `soundcard` + `SystemAudioCapture`, 16kHz mono after stereo→mono downmix
3. **`"both"`** (Ultra-only) — Parallel mic + loopback, mixed with anti-clip in `MixedAudioCapture`

**Audio pipeline**:
- `AudioCapture` (mic): sounddevice → 16kHz int16 mono, 20ms frames, async loop
- `SystemAudioCapture` (loopback): soundcard → 16kHz float32 stereo → downmix to int16 mono in daemon thread (COM initialized per Windows WASAPI requirements)
- `MixedAudioCapture` (both): two bounded queues + mixer thread (anchored to mic rhythm) → int32 sum with `np.clip(-32768, 32767)` anti-clip → int16 stereo
- All three → Deepgram (nova-3, 16kHz, mono, no changes to ASR pipeline)

### Feature Gating

- `Feature.SYSTEM_AUDIO_CAPTURE` — gates loopback access (Ultra-only)
- `Feature.SIMULTANEOUS_AUDIO` — gates mixed capture (Ultra-only)
- Free/Lite/Pro users are silently downgraded to `audio_source="mic"` in `ws/handler.py` if they request `"system"` or `"both"`
- Frontend shows locked button + "Ultra plan" tooltip; yellow hint below transcription warns mic-only users about headphone limitation

### Frontend (`AudioSourceSelector.tsx`, `StatusBar.tsx`, `Transcription.tsx`)

- **Selector**: Dropdown in StatusBar with mic/system/both icons + descriptions. Locked (🔒) for non-Ultra plans. Edit-only when `status === "idle" || "error"` (source is read at WS connect time)
- **Yellow hint**: Shows below transcription when plan lacks `system_audio_capture` and transcription is empty: *"🎧 Microphone mode: use speaker (not headphones) to capture interviewer. Upgrade to Ultra."*

### Bug Fixes (2026-06-27)

1. **JWT Clock Skew** (`backend/src/backend/auth/clerk.py`):
   - Added `leeway=datetime.timedelta(seconds=10)` to `jwt.decode()`
   - Tolerates up to 10s desynchronization between Clerk issuer and backend (RFC 7519 standard)
   - Prevents "token not yet valid (iat)" 403 errors on immediate reconnection

2. **COM Not Initialized** (`backend/src/backend/audio/capture.py`):
   - `SystemAudioCapture._capture_thread()` now calls `ctypes.windll.ole32.CoInitialize(None)` at start
   - Calls `CoUninitialize()` in `finally` block to clean up
   - Required because `soundcard` uses Windows COM API (WASAPI); COM must be initialized per-thread
   - Fixes `Error 0x800401f0 (CO_E_NOTINITIALIZED)` that prevented loopback from starting

---

## Windows Development Setup

### Environment

The app is being developed for **Windows 11** with the following toolchain:

- **Python 3.14.6** installed via `winget` (required by backend `pyproject.toml`)
- **Poetry 2.4.1** for Python dependency management (installed via pip, not official installer due to internet constraints)
- **Microsoft Visual Studio Build Tools 2026** for C++ compilation support
- **Node.js** (via `winget`) for frontend tooling
- **Rust toolchain** (via `rustup`) for Tauri compilation (optional, needed only for `npm run tauri build`)

### PATH Configuration

Windows has a built-in alias that redirects `python` to the Microsoft Store app, which interferes with Poetry. To work around this:

1. Python 3.14 is installed at: `C:\Users\react\AppData\Local\Programs\Python\Python314`
2. Poetry scripts are at: `C:\Users\react\AppData\Local\Programs\Python\Python314\Scripts`
3. Before running Poetry or Python commands, the script files (`start-backend.ps1`, `start-frontend.ps1`) explicitly reorder PATH to prioritize Python 3.14 and remove the WindowsApps alias

### Audio Capture: ~~sounddevice + soundcard~~ → now Rust (client-side)

> **Updated 2026-06-30:** audio capture moved out of Python into the **Rust client** (`src-tauri/src/audio.rs`, cpal + `wasapi`). The Python deps below (`sounddevice`/`soundcard`/`numpy`) were **removed** from `pyproject.toml`. The notes below are historical (they describe the old Python pipeline).

**Microphone** (`sounddevice >=0.4.6`):
- Pure Python with precompiled wheels (no build step)
- Provides NumPy array interface
- Works out-of-the-box on Windows, macOS, Linux
- `AudioCapture` class in `audio/capture.py` — 16kHz, 16-bit, mono, 20ms frames, async loop

**System audio loopback** (`soundcard >=0.4.3`, Windows-only):
- cffi-based, no native compilation, compatible with Python ≥3.14
- Uses Windows WASAPI API to capture the digital stream sent to speakers/headphones
- `SystemAudioCapture` class — captures stereo, downmixes to 16kHz int16 mono in daemon thread
- **Requires** COM initialization per thread (`CoInitialize` / `CoUninitialize`)
- Ultra plan feature (gated by `Feature.SYSTEM_AUDIO_CAPTURE`)
- Known limitation: captures ALL system audio (not just Zoom), not per-process yet

**Mixed capture** (`MixedAudioCapture`):
- Runs mic + loopback in parallel, sums PCM int16 with anti-clip in mixer thread
- Anchored to microphone rhythm (blocking read on mic, non-blocking on system with silence fallback)
- For users who want both their voice + interviewer captured in one stream
- Ultra plan feature (gated by `Feature.SIMULTANEOUS_AUDIO`)

### Startup Scripts

Two PowerShell scripts simplify local development:

- `start-backend.ps1` — Fixes PATH, then runs `poetry run uvicorn backend.main:app --reload --port 8000`
- `start-frontend.ps1` — Runs `npm install` (if needed), then `npm run tauri dev`

Usage: Open two PowerShell windows in the project root and run:
```powershell
# Terminal 1
.\start-backend.ps1

# Terminal 2
.\start-frontend.ps1
```

### Dependencies Updated

- `pyproject.toml` — Replaced `pyaudio` with `sounddevice`
- `poetry.lock` — Auto-regenerated via `poetry lock` (6/26/2026)

### Known Limitations

- ~~Rust toolchain not yet installed~~ — **Installed (2026-06-30):** Rust/cargo 1.96; `cargo check` passes, so `npm run tauri build` is now possible.
- ~~Backend API keys pending~~ — **Set (2026-06-30):** `backend/.env` has real Deepgram/DeepSeek/MiniMax/Convex keys locally; the same keys live as Railway service vars for the cloud backend.
- **Updater signing key + `updates-server` still pending** — `tauri.conf.json` `plugins.updater.pubkey` is a placeholder; the updates host is not deployed (see *Cloud Deployment*).
- **Local DNS gotcha (this dev machine):** the router-only resolver intermittently fails `getaddrinfo` (broke `curl`/`cargo`/MCP). Fix: set the adapter DNS to `8.8.8.8`/`1.1.1.1` (needs admin).

### Env Files Status (Windows dev machine)

| File | Status | Notes |
|---|---|---|
| `.env.local` | ✅ Created | `VITE_CLERK_PUBLISHABLE_KEY`, `VITE_CONVEX_URL`, `CONVEX_DEPLOYMENT` set (gitignored) |
| `backend/.env` | ✅ Complete | All keys set (Deepgram/DeepSeek/MiniMax/Convex/Clerk), gitignored. Same keys are Railway service vars in the cloud |
| `.env.{development,staging,production}` | ✅ Committed | Public build config only — `VITE_BACKEND_WS_URL` per Vite mode + public Convex/Paddle tokens |

## Other files

- `sugerencias.txt` — Clean Code/SOLID improvement suggestions (Spanish), covers SRP violations, command handler refactoring, conversation history management, type safety, magic strings
- `.vscode/settings.json` — Python interpreter path (Poetry virtualenv), extraPaths for backend analysis
- `SETUP-WINDOWS.md` — Complete Windows setup guide with troubleshooting

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
