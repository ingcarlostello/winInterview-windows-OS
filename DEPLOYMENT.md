# Deployment — Windows desktop (Tauri) + Backend on Railway (dev/prod)

This runbook covers shipping the desktop app as a signed Windows installer with
auto-update, and the FastAPI backend to Railway across two isolated environments.

## What changed (architecture)

The Python backend used to capture the user's audio from the **server's** OS
devices (`sounddevice`/`soundcard`). That only works when the backend runs on the
user's machine. To run it in the cloud, **audio capture moved into the Tauri/Rust
client**; it streams 16 kHz mono int16 PCM frames over the existing `/ws` socket,
and the backend forwards them to Deepgram. All secrets (Deepgram/DeepSeek/MiniMax/
ConvexBackendKey) stay on Railway — the installer ships only public config + the
updater public key + the user's own opaque `wik_*` key (entered at runtime).

Code changes already applied:
- Backend: `ws/handler.py` (text+binary receive), `audio/service.py` (`feed_audio`,
  no local capture), `audio/capture.py` (gutted), `ws/security.py` (Origin allowlist),
  `main.py`/`config.py` (CORS allowlist + env), `pyproject.toml` (removed
  sounddevice/soundcard/numpy), `Dockerfile` + `railway.json` + `.dockerignore`.
- Frontend: `useWebSocket.ts` / `ScreenPanel.tsx` (URL from `VITE_BACKEND_WS_URL`,
  audio Channel wiring), `vite-env.d.ts`, `.env.{development,staging,production}`,
  `useUpdater.ts` (+ wired in `App.tsx`).
- Rust: `src-tauri/src/audio.rs` (cpal mic + WASAPI loopback + mix + `start_audio`/
  `stop_audio`), `lib.rs` (module + state + updater/process plugins), `Cargo.toml`,
  `capabilities/default.json`, `tauri.conf.json` (updater + NSIS/MSI + artifacts).
- Updater host: `updates-server/` (FastAPI static + token-guarded `/publish`).
- CI: `.github/workflows/release.yml`.

---

## ⚠️ Required before anything builds end-to-end

1. **Compile the Rust** (this could not be done in the authoring environment — no
   crates.io access). On a machine with network + Rust ≥ 1.82:
   ```
   cd src-tauri && cargo check
   ```
   `audio.rs` uses `cpal` (mic) and the `wasapi` crate (loopback) — the `wasapi`
   API is pinned to 0.15 in `Cargo.toml`; if `cargo` resolves a different version,
   reconcile `run_loopback()` (notably `initialize_client` — 0.23+ takes a
   `StreamMode`). The mic path (`cpal`) and the rest are standard.
2. **Generate the updater signing key** and paste the public key into
   `tauri.conf.json` → `plugins.updater.pubkey` (currently a placeholder):
   ```
   npm run tauri signer generate -- -w ~/.tauri/wininterview.key
   ```
   Keep the private key + password as CI secrets (below). Never commit them.
3. **`poetry.lock`** has been regenerated for the trimmed deps. If you change
   `backend/pyproject.toml` again, re-run `cd backend && poetry lock`.

---

## 1. Railway — backend `api` service (one project, two environments)

1. Create a project (e.g. **winInterview-backend**). It starts with a
   `production` environment; add a `development` environment (Duplicate
   Environment to copy services/vars).
2. Add a service from this GitHub repo. In **Settings → Source**, set
   **Root Directory = `backend`** (Railway picks up `backend/Dockerfile` +
   `backend/railway.json`). Set the deploy branch per environment:
   `production` → `main`, `development` → `develop` (or the current feature branch
   while testing).
3. **Variables** (Settings → Variables), per environment — see the table below.
4. **Custom domain** (Settings → Networking → Public): add `api.wininterview.xyz`
   in `production` and `api-dev.wininterview.xyz` in `development`. Add **both**
   the CNAME and the TXT record Railway shows to your DNS (without the TXT it
   won't verify → 404). TLS is automatic. WSS works over the public domain.

### Backend env vars (per environment)

| Variable | dev | prod |
|---|---|---|
| `DEEPGRAM_API_KEY` | dev secret | prod secret |
| `DEEPSEEK_API_KEY` | dev secret | prod secret |
| `MINIMAX_API_KEY` | dev secret | prod secret |
| `CONVEX_BACKEND_KEY` | from Convex dev | from Convex prod |
| `VITE_CONVEX_URL` | `https://qualified-cuttlefish-550.convex.cloud` | `https://unique-jaguar-230.convex.cloud` |
| `CLERK_JWKS_URL` | dev issuer JWKS | prod issuer JWKS |
| `ALLOWED_ORIGINS` | `http://tauri.localhost,tauri://localhost,http://localhost:5173` | `http://tauri.localhost,tauri://localhost` |
| `ENFORCE_WS_ORIGIN` | `false` (until origin confirmed) | `false` → `true` after confirming |
| `APP_ENV` | `dev` | `live` |

`PORT` is injected by Railway. The first WS connect logs the real `Origin` header
— confirm it matches `ALLOWED_ORIGINS`, then flip `ENFORCE_WS_ORIGIN=true`.

> **Prod prerequisite:** prod Convex (`unique-jaguar-230`) is not yet provisioned.
> Until it is (DNS, env vars, `users:backfillUserKeys` with `APP_ENV=live`, the
> `auth.config.ts` issuer fix), point the prod backend at dev Convex or hold prod.

---

## 2. Railway — `updates` service (auto-update host)

1. Add a second service in the **same** project, **Root Directory = `updates-server`**.
2. Attach a **Volume** mounted at `/data` (Settings → Volumes).
3. Variables (per environment):
   - `UPDATES_PUBLISH_TOKEN` — strong random secret (shared with CI).
   - `UPDATES_PUBLIC_BASE_URL` — `https://updates.wininterview.xyz` (prod) /
     `https://updates-dev.wininterview.xyz` (dev).
   - `UPDATES_DATA_DIR=/data` (already defaulted in the Dockerfile).
4. Custom domain `updates.wininterview.xyz` (prod) / `updates-dev.wininterview.xyz`
   (dev) — CNAME + TXT as above. This must match `plugins.updater.endpoints` in
   `tauri.conf.json`.

`GET /latest.json` serves the manifest; `GET /<file>` serves installers;
`POST /publish` (Bearer `UPDATES_PUBLISH_TOKEN`) accepts a new release from CI.

---

## 3. Build installers (URL baked at build time, not in code)

The backend URL comes from `VITE_BACKEND_WS_URL` per Vite mode:

| Installer | Command | Points at |
|---|---|---|
| Local dev (no installer) | `npm run tauri dev` | `ws://localhost:8000` |
| Dev-backend installer | `npm run build:staging` then `npm run tauri build` * | `wss://api-dev.wininterview.xyz` |
| Prod installer | `npm run tauri build` | `wss://api.wininterview.xyz` |

\* For a staging installer, run with a staging `beforeBuildCommand` or build the
frontend first with `--mode staging` and then `tauri build` (which re-runs
`npm run build` = production by default — override `beforeBuildCommand` or use
`tauri build --config` to point the updater endpoint at `updates-dev`).

Outputs (NSIS + MSI) land in `src-tauri/target/release/bundle/{nsis,msi}/`, each
with a `.sig` (because `bundle.createUpdaterArtifacts: true`). The updater channel
uses the NSIS `*-setup.exe`.

---

## 4. Release flow (CI → updates service)

1. Set repo **secrets**: `TAURI_SIGNING_PRIVATE_KEY`,
   `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, `UPDATES_PUBLISH_TOKEN`; and **variable**
   `UPDATES_URL=https://updates.wininterview.xyz`.
2. Bump the version in **both** `package.json` and `src-tauri/tauri.conf.json`
   (must match; the updater compares it).
3. Tag and push: `git tag v0.2.0 && git push --tags`.
4. `.github/workflows/release.yml` (Windows runner) builds + signs, then POSTs the
   `*-setup.exe` + `.sig` to `${UPDATES_URL}/publish`, which regenerates
   `latest.json`. Installed apps auto-update on next launch (`useUpdater`).

---

## 5. Verification

- **Frontend (done here):** `npm run build` ✅ green, `npm run lint` ✅ clean.
- **Backend (done here):** Python files compile; `poetry.lock` regenerated.
- **Rust (pending — needs network):** `cd src-tauri && cargo check`, then
  `npm run tauri dev` and test mic / system / both audio against
  `wss://api-dev.wininterview.xyz`; confirm transcription, LLM responses, screen
  analysis, and quota flush to Convex.
- **Backend deploy:** hit `https://api-dev.wininterview.xyz/health` → `{"status":"ok"}`.
- **Updater:** install v0.1.x, publish v0.2.0 via CI, relaunch → confirms update.
  Verify a tampered/incorrect `.sig` is rejected (signature mismatch).

---

## Follow-ups / known items

- **Authenticode (recommended):** without it, Windows SmartScreen warns "unknown
  publisher" on first install. Add via `bundle.windows.signCommand` (Azure Trusted
  Signing is the cheapest indie path). Independent of the updater's minisign sig.
- **Pause optimization (optional):** the client keeps capturing while the WS is
  open (frames dropped server-side during pause). Hook `stop_audio`/`start_audio`
  to pause/resume to free the mic during pauses.
- **`audio_source` gating** is now effectively client-side (Rust honors plan
  flags); the meaningful resource — transcription-seconds quota — stays
  server-enforced.
- **WASAPI loopback ARM64:** known `GetNextPacketSize()==0` issue if you ever
  target Windows-on-ARM.
