# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Detailed reference:** [AGENTS.md](AGENTS.md) is the exhaustive map of every module, component, hook, WS message, and env var. This file is the orientation layer — the cross-cutting architecture and the gotchas that bite. Read AGENTS.md when you need the specifics of a single file; read this first to avoid the traps.

## What this repo is (and is NOT)

This is a **monorepo** containing three runtime pieces plus the database, all shipped together:

1. **Tauri v2 desktop app** — React 19 + TypeScript frontend (`src/`) inside a Rust shell (`src-tauri/`). A transparent, always-on-top overlay that floats over Zoom/Meet.
2. **Python FastAPI backend** (`backend/`) — the real-time orchestration brain. WebSockets + Deepgram (ASR) + DeepSeek (LLM) + MiniMax (vision).
3. **Convex backend** (`convex/`) — **this repo is the canonical source of the Convex deployment.** The function files in [convex/](convex/) are real and authoritative (users, quotas, prompts, Paddle webhooks, schema).

**Critical distinction:** there is a *separate* `reactjs-site` web dashboard repo (where users register via Clerk, manage billing, and generate their desktop access key). Its `CLAUDE.md` says "never run `convex deploy`" — **that warning applies only to that repo, which has no real `convex/`. It does NOT apply here.** Here, deploying Convex from this repo is the correct way to ship backend changes. Do not let the other repo's instructions leak into this one.

## Desktop auth is KEY-ONLY (Clerk was removed from the app)

The desktop app authenticates **only** with a pasted access key (`wik_test_*` / `wik_live_*`), persisted in the Zustand store. There is **no Clerk UI in the desktop app** — registration, Clerk login, and key generation all live in the separate web dashboard.

- [src/main.tsx](src/main.tsx) → [AuthProvider](src/providers/AuthProvider.tsx) wraps the app in a **plain `ConvexProvider`** (unauthenticated — no `ConvexProviderWithClerk`).
- [src/App.tsx](src/App.tsx) gates on `userKey`: no key → render `KeyLoginForm`; key present → render `Overlay`. Logout = `disconnect(); clearUserKey()`.
- [useAppAuth](src/hooks/useAppAuth.ts) returns `isAuthed = Boolean(userKey)` and builds the WS credential segment `key=<userKey>` (the Python backend resolves the opaque key to the user server-side).
- The access key is an **opaque bearer token, NOT a JWT** — the plan cannot be decoded client-side; it must be fetched (see plan resolution below).

Convex still contains Clerk-identity functions (`storeUser`, `getCurrentUserPlanInfo`, `getCurrentUserSubscription`, the Clerk webhook) — those are used by the **web dashboard and Paddle webhooks**, not the desktop. The desktop's only Convex call is the public `getPlanInfoByUserKey` query.

## Commands

```bash
# Frontend (run from repo root)
npm run dev            # Vite dev server on :5173 (STRICT port — Tauri expects it here)
npm run build          # tsc -b && vite build  (typecheck is part of the build)
npm run lint           # eslint .
npm run preview        # preview the production build

# Full desktop app (needs Rust toolchain)
npm run tauri dev      # Vite + Tauri window together
npm run tauri build    # runs `npm run build` first via beforeBuildCommand

# Python backend (run from backend/)
cd backend
poetry install                                              # requires Python >= 3.14
poetry run uvicorn backend.main:app --reload --port 8000

# Convex backend — DEPLOY FROM THIS REPO (see note above)
node node_modules/convex/bin/main.js dev --once             # push schema+functions to dev
node node_modules/convex/bin/main.js run users:backfillUserKeys
node node_modules/convex/bin/main.js env list               # inspect deployment env
# (equivalent to `npx convex ...`; the node-bin path is the known-working invocation on this Windows machine)
```

**Windows dev shortcut:** `./start-backend.ps1` and `./start-frontend.ps1` fix the PATH (Python 3.14 vs the WindowsApps `python` alias) and launch each process. Use two terminals.

**Tests:** there is **no test suite** in this repo (no Vitest/Jest config, no `backend/tests/`). Don't fabricate a test command; verify changes with `npm run build` (typecheck) + `npm run lint`, and manual `npm run tauri dev`.

## The plan/tier system spans four layers (the key cross-file concept)

A user's plan (`free` / `lite` / `pro` / `ultra`) gates features and quotas, and the truth flows through **four layers** — understanding this is essential before touching anything plan-related:

1. **Convex = source of truth.** [convex/constants.ts](convex/constants.ts) defines `PLAN_QUOTAS`, `PLAN_FEATURES`, `PLAN_NAMES`, `PLAN_RANK` (upgrade/downgrade direction). [convex/users.ts](convex/users.ts) `buildPlanInfoForUser()` maps a user doc → the frontend `PlanInfo` shape, shared by both the Clerk-identity query (`getCurrentUserPlanInfo`) and the key-based query (`getPlanInfoByUserKey`). Paddle webhooks are the **only** way `planId` changes (`applySubscription` is an `internalMutation`). **Downgrade scheduling:** self-service `changeSubscriptionPlan` action stores `pendingPlanId` + `pendingPlanEffectiveAt` when user downgrades (lower rank); the actual plan stays high until the effective date; on renewal webhook or cron backstop (`applyDuePendingDowngrades`), the low plan is applied. Frontend sees the live `planId` (high) + `pendingPlanId` (low) via `getCurrentUserSubscription`, so UI can show "downgrading on DATE".
2. **Python `PlanGate` = enforcement.** On every WS connect the backend loads the user's plan + remaining quota from Convex, enforces feature/quota limits in-memory, then flushes consumption back to Convex (after each LLM response and on disconnect).
3. **Zustand `planSlice` = live client cache.** [src/stores/slices/planSlice.ts](src/stores/slices/planSlice.ts) holds `planInfo`. It is seeded by [usePlanSync](src/hooks/usePlanSync.ts) (reactive `getPlanInfoByUserKey` query) and updated live by WS `PLAN_INFO` / `QUOTA_UPDATE` messages. **`usePlanSync` calls `mergePlanInfo`, not `setPlanInfo`** — merge deliberately never *raises* a quota's remaining, so a stale Convex re-read can't clobber the fresher live WS countdown.
4. **Rust = shortcut guardian.** `update_plan_permissions` / `set_content_protected` Tauri commands flip atomic flags so global shortcuts and invisible mode respect the plan.

**`planInfo` is account-state, not session-state.** It starts `null`, falls back to `DEFAULT_PLAN_INFO` (= free) in `hasFeature`/`getQuota`. It must **persist across disconnect** (do NOT null it in `reset()`) and is cleared **only on logout** (`clearUserKey` sets `planInfo: null`). Because the key is opaque, the plan is fetched async — render a **skeleton while `planInfo` is null** rather than the literal "Free", or the badge flashes free→real on every login (see [StatusBar.tsx](src/components/StatusBar.tsx)).

## Real-time session data flow

```
Audio (CLIENT-SIDE Rust: cpal mic + WASAPI loopback, src-tauri/src/audio.rs) → 16 kHz
  mono i16 PCM → base64 over a Tauri Channel → JS re-sends as BINARY WS frames → backend
  /ws relays each frame to Deepgram nova-3 (ASR only, VAD) → transcription
  → DeepSeek (deepseek-v4-flash) streams response → WS chunks → React renders Markdown
Screen capture: Tauri `capture_screen` (xcap crate, src-tauri) → base64 in Zustand
  → separate WS `/api/ws/analyze-screens` → MiniMax (MiniMax-M3) vision → streamed solution
```

**Audio capture moved Python → Rust client (2026-06-30)** so the backend runs **headless in the cloud** (Railway has no mic/speakers; `import sounddevice` even fails to load on Linux). The backend no longer owns capture: [ws/handler.py](backend/src/backend/ws/handler.py) now uses `websocket.receive()` (text = commands, bytes = audio frames) → `AgentSession.feed_audio()` → `AudioStreamingService.feed_audio()` → Deepgram. Device gating of `audio_source` (system/both = Ultra) is now effectively client-side; the **transcription-seconds quota stays server-enforced** via `PlanGate`.

The Python backend is split by responsibility: `audio/` (Deepgram lifecycle + `feed_audio`; **local-capture classes removed** — `capture.py` is a stub), `llm/`, `agent/` (Deepgram wrapper), `ws/` (session coordinator + registry-based command parser + `security.py` Origin allowlist), `plan_gate.py`, `convex_client.py`. **Python ↔ Convex always goes through HTTP actions authed with `CONVEX_BACKEND_KEY`** — never direct internal-function calls.

## Build-breaking constraints

`tsconfig` is strict; the build (`tsc -b`) fails on these — match the surrounding code:

- **`verbatimModuleSyntax`** — type-only imports MUST use `import type { ... }` (and `export type`).
- **`noUnusedLocals` / `noUnusedParameters`** — no unused variables or params.
- **`erasableSyntaxOnly`** — no enums, no `declare` class fields, no legacy namespaces.
- **Tailwind CSS v4** — configured in CSS via `@theme` in [src/index.css](src/index.css); there is **no `tailwind.config.*`**.
- **Strict Vite port 5173** — Tauri's dev URL is hardcoded to it.
- **Rust changes need a rebuild** — Vite HMR does not cover `src-tauri/`; restart `npm run tauri dev`.

## Convex / deployment gotchas

- **Dev** (`dev:qualified-cuttlefish-550`, in `.env.local`) is fully configured and is what both the desktop and the web dashboard talk to. Deploy/test against dev freely.
- **Prod** (`unique-jaguar-230`) is currently **not provisioned** (no DNS, zero env vars as of mid-2026). Do **not** `convex deploy` to prod until it's provisioned and its secrets (`CLERK_ISSUER_URL`, `CLERK_SECRET_KEY`, `APP_ENV=live`, Paddle keys) are set. Verify current state first.
- **Prod auth bug (not yet fixed):** [convex/auth.config.ts](convex/auth.config.ts) hardcodes the *dev* Clerk issuer. Prod needs the prod issuer (`clerk.wininterview.xyz`); the clean fix is reading `process.env.CLERK_ISSUER_URL`.
- When provisioning prod: set `APP_ENV=live` **before** running `users:backfillUserKeys`, so generated keys get the `wik_live_` prefix.

## Cloud deployment (Railway) — shipped 2026-06-30

The Python backend is **deployed to Railway** (dev environment live and validated end-to-end). The desktop app no longer requires a local backend — it connects to the cloud over WSS, with **zero secrets in the client** (all real API keys live in Railway).

- **Project** `winInterview-backend` (id `1f45c442-…`), service **`api`**, builds from **`backend/Dockerfile`** with **Root Directory = `backend`**. Tracks the **`main`** branch (auto-deploys on push). `/health` is the healthcheck.
- **URLs:** `https://api-production-d6a6.up.railway.app` and the custom domain **`https://api-dev.wininterview.xyz`** (valid TLS). The desktop reaches it via WSS.
- **Railway service env vars** (server-side, never in the client): `DEEPGRAM_API_KEY`, `DEEPSEEK_API_KEY`, `MINIMAX_API_KEY`, `CONVEX_BACKEND_KEY`, `VITE_CONVEX_URL`, `APP_ENV=dev`, `ALLOWED_ORIGINS`, `ENFORCE_WS_ORIGIN` (currently `false` = log-only; flip to `true` after confirming the real Tauri Origin — observed dev Origin is `http://localhost:5173`, prod build will be `http://tauri.localhost`).
- **Custom domains need a `_railway-verify.<sub>` TXT ownership record** (private projects) **plus** the CNAME — Railway's dashboard (Settings → Networking) shows both; do NOT rely on the railway-agent for domains (it omits the TXT and churns the domain list). DNS for `wininterview.xyz` lives at **Hostinger**.
- **Prod** Railway env is **not set up** — blocked on prod Convex (`unique-jaguar-230`) being provisioned.
- The Tauri **installer + signed auto-updater** scaffolding exists (`src-tauri/src/audio.rs`, `useUpdater`, NSIS/MSI in `tauri.conf.json`, `updates-server/`, `.github/workflows/release.yml`) but is **not yet operational**: the updater signing key is ungenerated (pubkey is a placeholder) and `updates-server` is not deployed. `cargo check` passes.

## Environment files

- Frontend `.env.local` (**gitignored**) — `VITE_CONVEX_URL`, `CONVEX_DEPLOYMENT` (`dev:qualified-cuttlefish-550`), `VITE_CLERK_PUBLISHABLE_KEY`. `.env.development.local` (gitignored) can override `VITE_BACKEND_WS_URL` to point `npm run tauri dev` at the cloud backend.
- Frontend `.env.development` / `.env.staging` / `.env.production` (**committed — public build config only**) — set `VITE_BACKEND_WS_URL` per Vite mode (`ws://localhost:8000` / `wss://api-dev.wininterview.xyz` / `wss://api.wininterview.xyz`), plus public `VITE_CONVEX_URL` / `VITE_PADDLE_CLIENT_TOKEN`. The backend URL is **never hardcoded** — read from `import.meta.env.VITE_BACKEND_WS_URL` in [useWebSocket.ts](src/hooks/useWebSocket.ts) and [ScreenPanel.tsx](src/components/ScreenPanel.tsx).
- Backend `backend/.env` (**gitignored**) — `DEEPGRAM_API_KEY`, `DEEPSEEK_API_KEY`, `MINIMAX_API_KEY`, `CLERK_SECRET_KEY`, `CONVEX_BACKEND_KEY`. In the cloud these are Railway service vars instead.
- Convex deployment env (via `convex env set`) — Clerk, Paddle, `CONVEX_BACKEND_KEY`, `APP_ENV`.
- **`.mcp.json` must never contain literal secrets** — use `${VAR}` env-var refs (`${PADDLE_LIVE_API_KEY}`, `${HOSTINGER_API_TOKEN}`) and set the var locally. A live Paddle key and a Hostinger token were each leaked here once (both since rotated); the file is committed, so a literal secret goes straight to the public repo.
