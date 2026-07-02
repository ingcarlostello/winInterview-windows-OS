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
  no local capture), `audio/capture.py` (gutted, then deleted 2026-07-02), `ws/security.py` (Origin allowlist),
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
   `tauri.conf.json` → `plugins.updater.pubkey`. **DONE (2026-07-01):** the real
   pubkey is committed and the key has a **non-empty password**. (An empty
   password does NOT work on Windows: PowerShell's
   `$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ""` *deletes* the variable, so the
   signer prompts interactively and the build hangs forever. The keypair was
   regenerated with a strong password; the committed pubkey matches that key.)
   ```
   node node_modules/@tauri-apps/cli/tauri.js signer generate -w ~/.tauri/wininterview.key -f
   ```
   **KEY CUSTODY — one-way door.** The pubkey is compiled into every binary; if
   the private key **or its password** is lost, all already-installed clients are
   permanently unable to auto-update (no cryptographic recovery — the only fix is
   to ship a new pubkey and have every user reinstall manually). Back up
   `~/.tauri/wininterview.key` **and the password** in a secrets vault **and**
   offline. Never commit them. They are also stored as the CI secrets
   `TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.
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

> **Prod prerequisite — DONE (2026-06-30):** prod Convex (`unique-jaguar-230`) is
> provisioned and live (env vars, functions, `APP_ENV=live`, issuer fix); the prod
> backend points at it.

---

## 2. Railway — `updates` service (auto-update host)

**DEPLOYED (2026-07-01)** in project `winInterview-backend`, env **`prod`**:
service **`updates`** (`9190f6f0-5665-4456-8738-2529589bfb00`), Volume
`b3325995-0afb-411c-9417-a6601797bbbc` at `/data`, root `updates-server`
(Dockerfile), healthcheck `/health` green (uvicorn on `:8080`, `/health` → 200).

1. Add a service in the **same** project, **Root Directory = `updates-server`**.
2. Attach a **Volume** mounted at `/data` (must exist BEFORE the first `/publish`,
   else artifacts land on the ephemeral FS and vanish on redeploy).
3. Variables set: `UPDATES_PUBLISH_TOKEN` (strong random, **must match** the CI
   secret of the same name), `UPDATES_PUBLIC_BASE_URL=https://updates.wininterview.xyz`,
   `UPDATES_DATA_DIR=/data`.
4. Custom domain `updates.wininterview.xyz` — **LIVE (2026-07-01, valid TLS)**:
   added in the Railway dashboard (Settings → Networking), then CNAME +
   **`_railway-verify.updates` TXT** created at Hostinger (same pattern as
   `api`/`api-dev`). Matches `plugins.updater.endpoints` in `tauri.conf.json`.
   Do NOT use railway-agent for domains (it omits the TXT).

`GET /latest.json` serves the manifest (404 before the first publish = treated as
"up to date" — expected); `GET /<file>` serves installers; `POST /publish`
(Bearer `UPDATES_PUBLISH_TOKEN`) accepts a new release from CI.

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

## 4. Release flow (CI → updates service + GitHub Release)

1. Set repo **secrets**: `TAURI_SIGNING_PRIVATE_KEY` (content of
   `~/.tauri/wininterview.key`), `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (the key's
   password — must be non-empty, see key custody above),
   `UPDATES_PUBLISH_TOKEN` (**identical** to the Railway `updates` var); and
   **variable** `UPDATES_URL=https://updates.wininterview.xyz`.
2. **Version invariant (enforced in CI):** the tag (minus `v`) must equal
   `package.json` **and** `src-tauri/tauri.conf.json` `version`. The workflow's
   "Verify tag matches app version" step fails the build on any mismatch — CI
   derives the manifest version from the tag, but the updater compares it to the
   version compiled from `tauri.conf.json`, so a mismatch strands clients.
3. Tag and push: `git tag v0.1.0 && git push origin v0.1.0`.
4. `.github/workflows/release.yml` (Windows runner) verifies the version, builds +
   signs, POSTs the NSIS `*-setup.exe` + `.sig` to `${UPDATES_URL}/publish` (which
   regenerates `latest.json`), and creates a **GitHub Release** with the
   `*-setup.exe` + `.sig` + `*.msi` attached. The GitHub Release is the canonical
   **first-time download** link for new users (the updater only reaches already-
   installed apps) and the artifact archive for rollback. Installed apps surface an
   in-app "Restart now / Later" prompt on next launch (`useUpdater` + `UpdateBanner`);
   they never auto-relaunch on their own.

### Rollback / blast radius

Every `/publish` overwrites `latest.json` and reaches **100% of clients** on their
next launch (no staged rollout with a single manifest). The updater is
**forward-only** — it never downgrades — so you cannot pull a bad version back by
re-publishing the previous one. **Rollback = roll-forward:** publish a higher
version (e.g. `v0.1.2`) containing the fix/revert. To stop *not-yet-updated*
clients from taking a bad build, blank/replace `latest.json` on the `updates`
volume. Every signed artifact is archived on its GitHub Release for quick rebuild.

---

## 5. Verification

- **Frontend (done here):** `npm run build` ✅ green, `npm run lint` ✅ clean.
- **Backend (done here):** Python files compile; `poetry.lock` regenerated.
- **Rust:** `cargo check` green (2026-06-30); real signed installers built since.
- **Backend deploy:** hit `https://api-dev.wininterview.xyz/health` → `{"status":"ok"}`.
- **Updater — VERIFIED E2E (2026-07-01, v0.1.0 → v0.1.1):** installed 0.1.0
  per-user (NSIS lands in `%LOCALAPPDATA%\interview-responder\`, binary is
  `app.exe`), tagged v0.1.1 → CI published → relaunch: silent download →
  `UpdateBanner` → "Después" dismisses without restarting → "Reiniciar ahora"
  runs the passive NSIS install and relaunches as 0.1.1 (binary + uninstall
  registry confirmed). **Negative test:** published a manifest whose signature
  didn't match the artifact → app refused to install and kept running 0.1.1
  (manifest then restored). **Up-to-date launch:** no banner, normal startup.

---

## Follow-ups / known items

- **Authenticode (DEFERRED for v1 by decision 2026-07-01):** without it, Windows
  SmartScreen warns "unknown publisher" on first install (does not block install or
  affect auto-update). Put a "click *More info → Run anyway*" note next to the
  download link. Revisit with **Azure Trusted Signing** (~$10/mo, cheapest indie
  path) or an EV cert if it measurably costs installs. Add via
  `bundle.windows.signCommand`. Independent of the updater's minisign sig.
- **Updater UX (shipped 2026-07-01):** `useUpdater` downloads silently in the
  background but never auto-installs/relaunches; `UpdateBanner` shows a
  non-blocking "Restart now / Later" prompt so a relaunch can't land mid-interview.
  "Later" re-prompts on the next launch.
- **Pause optimization (optional):** the client keeps capturing while the WS is
  open (frames dropped server-side during pause). Hook `stop_audio`/`start_audio`
  to pause/resume to free the mic during pauses.
- **`audio_source` gating** is now effectively client-side (Rust honors plan
  flags); the meaningful resource — transcription-seconds quota — stays
  server-enforced.
- **WASAPI loopback ARM64:** known `GetNextPacketSize()==0` issue if you ever
  target Windows-on-ARM.
