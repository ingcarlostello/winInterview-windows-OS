# AGENTS.md

## Architecture

- **Tauri v2 desktop app** (React + TypeScript frontend, Rust shell, Python orchestration backend)
- **Frontend**: `src/` — React 19, Tailwind CSS v4, Zustand, Vite, react-markdown, react-syntax-highlighter
- **Desktop shell**: `src-tauri/` — Rust (window management commands, global shortcuts, ghost mode, content protection)
- **Orchestration backend**: `backend/` — FastAPI + WebSockets, managed via Poetry. Uses Deepgram SDK (nova-3 for ASR), NVIDIA API (Gemma 3n for LLM), DashScope/Aliyun (Qwen for vision analysis)
- The app runs as a transparent, always-on-top overlay (`730×730` collapsed, `1600×730` expanded, frameless) designed to float over Zoom/Meet
- **Flow**: Microphone → PyAudio (16kHz PCM) → streamed to Deepgram Agent (ASR only) → transcription triggers LLM streaming via NVIDIA Gemma → Response chunks via WebSocket → Frontend renders Markdown + code blocks
- **Screen capture**: Tauri command `capture_screen` in `src-tauri/src/lib.rs` uses the `xcap` crate to capture the first monitor, resizes to a max width of 1280 px, encodes as JPEG (quality 75), and returns base64 → stored in Zustand (`screenImages`, max 4). Each successful capture decrements `screen_captures` quota in Convex via `useCaptureQuota`. VisionLLMService (Qwen) analyzes captures via separate WebSocket
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

**`src/hooks/usePlanSync.ts`**:

- Reactive Convex query (`users.getCurrentUserPlanInfo`) seeds `planInfo` into Zustand on app load (only when the store has no current plan info)
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
- `ScreenPanel.tsx` — `MAX_CAPTURES` varies by `simultaneous_captures` feature; `capturesRemaining`/`capturesExceeded` and `analysesRemaining`/`analysesExceeded` shown; `custom_prompts` gates only the prompt textarea ("Pro" badge + Lock icon); the analyze button is always available while quota remains and uses the default prompt when custom prompts are locked; `?token=` param on WS URL
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
- On every WebSocket connection the backend loads the user's `planId` and current quota remaining from Convex, so in-memory usage starts from the real persisted state
- After each LLM response and on disconnect, `PlanGate` flushes consumed quota to Convex and the backend sends an updated `PLAN_INFO` message
- Transcription quota exceeded → finish current LLM response, then pause with upgrade message
- When quota expires automatically via timer (`_expire_session`), remaining seconds are consumed and flushed to Convex immediately before pausing — no need to wait for disconnect

### Modules

| Module | Purpose |
|---|---|
| `config.py` | Pydantic settings: `deepgram_api_key`, `nvidia_api_key`, `dashscope_api_key`, `host`, `port` |
| `tiers.py` | `PlanId` (LITE/PRO/ULTRA), `Feature` (CUSTOM_PROMPTS, SIMULTANEOUS_CAPTURES, SIMULTANEOUS_ANALYSIS, KEYBOARD_SHORTCUTS, INVISIBLE_MODE, GHOST_MODE), `Quota` (TRANSCRIPTION_SECONDS, SCREEN_CAPTURES, SCREEN_ANALYSES) enums. `PlanDefinition` dataclass. `PLANS` dict with per-plan features/quotas. Helper functions: `get_plan()`, `has_feature()`, `get_quota_limit()` |
| `convex_client.py` | Authenticated HTTP client for the Python backend to call Convex HTTP actions (`/api/users/get`, `/api/quotas/decrement`) |
| `plan_gate.py` | `FeatureBlockedError`, `QuotaExceededError` exceptions. `PlanGate` class: initializes usage from Convex remaining, enforces feature/quotas in-memory, and flushes consumption to Convex via `ConvexClient` |
| `context.py` | `ConversationHistory` — message list management (system prompt + user/assistant messages, max 20, auto-trim). Used by `AgentSession` |
| `dependencies.py` | DI singletons: `get_connection_manager()`, `get_llm_service()` (DeepSeekLLMService), `get_vision_service()` (VisionLLMService) |
| `ws_manager.py` | `ConnectionManager` with typed sends using `WsMessageType`/`WsStatus` enums: `send_status`, `send_transcription`, `send_response_chunk`, `send_error`, `send_screen_chunk`, `send_screen_image` |
| `ws/handler.py` | `websocket_endpoint` FastAPI handler. Verifies Clerk JWT from `?token=`, fetches plan/quotas from Convex via `ConvexClient`, creates `PlanGate`, and injects into `AgentSession`. Language/prompt come from query params. Uses `CommandParser` via `create_default_parser()` |
| `ws/session.py` | `AgentSession` class (~240 lines). Pure coordinator: wires `AudioStreamingService` ↔ `ConversationHistory` ↔ LLM/Vision ↔ WebSocket. Accepts optional `audio_service`, `history` params for DI/testing. `DialogCoordinator` inner class handles business logic with `PlanGate` integration. `_send_plan_info()` on connect and after each flush. Feature gates on set/clear_prompt |
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
| `routers/screens.py` | WebSocket: `/api/ws/analyze-screens` accepts `?token=`, verifies the Clerk JWT, fetches plan/quotas from Convex, then receives JSON with images array + prompt and streams vision analysis chunks. Uses `WsMessageType` enum. `PlanGate` per connection; gates `SIMULTANEOUS_ANALYSIS` and `SCREEN_ANALYSES` quota; flushes consumption to Convex on close |

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

- **Frontend** (`.env`):
  - `VITE_CLERK_PUBLISHABLE_KEY` — Clerk publishable key (pk_test_...)
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
| `convex/auth.config.ts` | Clerk JWT issuer configuration for Convex auth |
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

The app uses **Paddle** for subscription billing. Paddle manages checkout, payment, and subscription lifecycle via webhooks to Convex.

### Architecture

- **Paddle** handles checkout (hosted), payment processing, and subscription lifecycle
- **Convex** receives webhooks from Paddle and updates `users.planId` + paddle fields
- The `free` tier is the default for users without a subscription (3 min transcription, 0 captures/analyses)
- Lite/Pro/Ultra are paid tiers ($4.99/$19.99/$59.99 monthly) — subscription required to unlock
- Flow: User clicks "Subscribe" → `createCheckout` action creates Paddle transaction → Tauri opens hosted checkout URL → user pays → Paddle webhook → `applySubscription` mutation → `planId` updated → reactive query auto-updates frontend

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
| `subscription.updated` | Update plan (upgrade/downgrade) |
| `subscription.created` | Store subscription data |
| `subscription.canceled` | Revert to `free` |
| `subscription.past_due` | Revert to `free` |
| `subscription.paused` | Revert to `free` |
| `subscription.resumed` | Restore plan from price.custom_data.plan_id |
| `transaction.completed` | Backup confirmation — set plan |
| `transaction.payment_failed` | Log warning |

### Convex Schema (Paddle fields on `users`)

- `paddleCustomerId` — Paddle customer ID (`ctm_...`)
- `paddleSubscriptionId` — Paddle subscription ID (`sub_...`)
- `paddleStatus` — `active` | `canceled` | `past_due` | `paused`
- `paddleCancelUrl` — Management URL for cancellation
- `paddleUpdatePaymentUrl` — Management URL for payment method update
- `subscriptionCurrentPeriodEnd` — Current billing period end date
- Indexes: `by_paddle_customer`, `by_paddle_subscription`

### Key Files

| File | Purpose |
|---|---|
| `convex/paddle.ts` | `paddleWebhook` httpAction (verifies Paddle-Signature, processes events) + `createCheckout` action (creates Paddle transaction, finds/creates customer) |
| `convex/http.ts` | Registers `/api/webhooks/paddle` and existing routes |
| `convex/users.ts` | `applySubscription` (internalMutation — the ONLY way to change planId), `getCurrentUserSubscription` query |
| `convex/constants.ts` | `PlanId` includes `free`, `PLAN_QUOTAS.free`, `PLAN_PRICES_USD` |
| `src/hooks/useCheckout.ts` | Calls `createCheckout` action, opens checkout URL via Tauri `open_url` command |
| `src/components/PricingModal.tsx` | 3-tier pricing UI, subscribe buttons, subscription management (cancel/update payment via management_urls) |
| `src/components/StatusBar.tsx` | Crown badge opens PricingModal |
| `src-tauri/src/lib.rs` | `open_url` command — opens external URLs in system browser (cross-platform) |

### Security

- **`updateUserPlan` was converted to `internalMutation` (`applySubscription`)** — the ONLY way to change `planId` is through the Paddle webhook. Previously it was a public mutation (security vulnerability).
- Webhook signature verification uses HMAC-SHA256 with `Paddle-Signature` header (`ts` + `h1` format)
- Timestamp tolerance: 5 minutes (anti-replay)
- `createCheckout` action requires authenticated Clerk identity
- `PADDLE_API_KEY` is server-side only (Convex env, never exposed to frontend)

### Paddle Sandbox IDs (dev)

- Product: `pro_01kvc6na730nwkyafndw2dpa3n`
- Price Lite: `pri_01kvc6na8fharg06tas9cb5da4`
- Price Pro: `pri_01kvc6na9wsxctyp9291jtmer6`
- Price Ultra: `pri_01kvc6nab71h76fpdcx203wkag`
- Notification setting: `ntfset_01kvc6nn781ktgwfd8n5sqrqfd`

## Other files

- `sugerencias.txt` — Clean Code/SOLID improvement suggestions (Spanish), covers SRP violations, command handler refactoring, conversation history management, type safety, magic strings
- `.vscode/settings.json` — Python interpreter path (Poetry virtualenv), extraPaths for backend analysis

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
