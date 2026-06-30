"""Tiny static host for the Tauri auto-updater, deployed as its own Railway
service backed by a Volume (mounted at /data).

- GET  /latest.json           → the update manifest the desktop app polls
- GET  /<file>                → download a published installer (e.g. *-setup.exe)
- POST /publish               → CI uploads a new signed release (Bearer token)

Railway has no clean "push file into a Volume" primitive, so CI publishes via
this authenticated endpoint. Set per environment:
  UPDATES_PUBLISH_TOKEN     shared secret for /publish (required)
  UPDATES_PUBLIC_BASE_URL   public URL of THIS service (e.g.
                            https://updates.wininterview.xyz) — used to build
                            the download `url` in latest.json
  UPDATES_DATA_DIR          volume mount path (default /data)
"""

import json
import os
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import FileResponse, JSONResponse

DATA_DIR = Path(os.environ.get("UPDATES_DATA_DIR", "/data"))
PUBLISH_TOKEN = os.environ.get("UPDATES_PUBLISH_TOKEN", "")
PUBLIC_BASE_URL = os.environ.get(
    "UPDATES_PUBLIC_BASE_URL", "https://updates.wininterview.xyz"
).rstrip("/")

DATA_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="WinInterview Updates")


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/latest.json")
async def latest():
    manifest = DATA_DIR / "latest.json"
    if not manifest.exists():
        # 404 → the updater treats "no release yet" as up-to-date.
        raise HTTPException(status_code=404, detail="no release published yet")
    return FileResponse(manifest, media_type="application/json")


@app.post("/publish")
async def publish(
    version: str = Form(...),
    notes: str = Form(""),
    setup: UploadFile = File(...),
    signature: UploadFile = File(...),
    authorization: str = Header(default=""),
):
    if not PUBLISH_TOKEN or authorization != f"Bearer {PUBLISH_TOKEN}":
        raise HTTPException(status_code=401, detail="unauthorized")

    setup_name = Path(setup.filename or "").name
    if not setup_name.lower().endswith((".exe", ".msi")):
        raise HTTPException(status_code=400, detail="setup must be an .exe/.msi")

    (DATA_DIR / setup_name).write_bytes(await setup.read())
    sig_text = (await signature.read()).decode("utf-8").strip()

    manifest = {
        "version": version,
        "notes": notes,
        "pub_date": datetime.now(timezone.utc).isoformat(),
        "platforms": {
            "windows-x86_64": {
                "signature": sig_text,
                "url": f"{PUBLIC_BASE_URL}/{setup_name}",
            }
        },
    }
    (DATA_DIR / "latest.json").write_text(json.dumps(manifest, indent=2))
    return JSONResponse(manifest)


@app.get("/{filename}")
async def download(filename: str):
    # Path().name strips any directory components → no path traversal.
    safe = Path(filename).name
    target = DATA_DIR / safe
    if not target.exists() or not target.is_file():
        raise HTTPException(status_code=404, detail="not found")
    return FileResponse(target, media_type="application/octet-stream")
