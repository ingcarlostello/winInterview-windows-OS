# Implementation Plan - Option B: Cloud-Hosted Backend (with Railway Deployment)

This plan details the migration of the application to a hybrid cloud architecture. The Python FastAPI backend will run on **Railway**, and the Tauri client will capture audio locally using the Web Audio API (`AudioWorklet`) and stream it over the existing WebSocket connection.

## Goal Description
By moving the backend to the cloud, we eliminate native audio dependencies (`pyaudio`, `portaudio`) on the client's OS, reducing the local app size from >100MB to ~10MB. We also secure our AI API keys in the cloud environment and make future model changes instantaneous through server deployments.

---

## User Review Required

> [!IMPORTANT]
> **Railway Environment Variables**: You will need to set the following variables in the Railway dashboard for the backend service:
> * `DEEPGRAM_API_KEY` (ASR)
> * `DEEPSEEK_API_KEY` (LLM)
> * `DASHSCOPE_API_KEY` (Vision)
> * `CLERK_JWKS_URL` (Auth verification)
> * `VITE_CONVEX_URL` (Convex backend URL - needed for `ConvexClient` mapping)
> * `CONVEX_BACKEND_KEY` (Access key for Convex HTTP actions)
>
> **Railway Port Configuration**: Railway injects a dynamic `$PORT` environment variable. The Docker container will be configured to bind to `0.0.0.0` and read the injected `${PORT}` variable dynamically.
>
> **macOS Microphone Permission**: Under macOS, transparent window shells must declare a microphone usage description to allow `getUserMedia` in the WebView. We will add the `NSMicrophoneUsageDescription` key inside the `bundle -> macOS -> infoPlist` section of `tauri.conf.json`.

---

## Proposed Changes

### 1. Backend: Dependency Cleanup & Binary Support

#### [MODIFY] [pyproject.toml](file:///Users/carlos/Desktop/interview_responder/backend/pyproject.toml)
* Remove `pyaudio` from dependencies list.

#### [DELETE] [capture.py](file:///Users/carlos/Desktop/interview_responder/backend/src/backend/audio/capture.py)
* Remove this file entirely, as the client will perform audio capture instead of the local machine.

#### [MODIFY] [service.py](file:///Users/carlos/Desktop/interview_responder/backend/src/backend/audio/service.py)
* Remove `AudioCapture` imports and initialization.
* Simplify lifecycle methods (`start`, `stop`, `pause`, `resume`, `restart`) to only manage the `DeepgramAgent` WebSocket lifecycle.
* Add `send_audio_frame(frame: bytes)` to forward incoming client audio chunks directly to `self.agent.send_media(frame)`.

#### [MODIFY] [handler.py](file:///Users/carlos/Desktop/interview_responder/backend/src/backend/ws/handler.py)
* Update `websocket_endpoint` receive loop to handle both text messages and binary messages.
* When receiving bytes (binary message), forward them to `session.handle_audio_frame(bytes)`.

#### [MODIFY] [session.py](file:///Users/carlos/Desktop/interview_responder/backend/src/backend/ws/session.py)
* Add `async def handle_audio_frame(self, frame: bytes)` which calls `self.audio.send_audio_frame(frame)`.
* Modify `start()` and other methods to remove local PyAudio stream start/stop side effects.

#### [NEW] [Dockerfile](file:///Users/carlos/Desktop/interview_responder/backend/Dockerfile)
* Create a simple, lightweight Dockerfile to containerize the FastAPI app using a standard Python slim image without native PortAudio compilers.
* Configure it to run: `CMD ["sh", "-c", "poetry run uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8000}"]` to dynamically support Railway's port assignment.

---

### 2. Frontend: Audio Capture & WebSocket Stream

#### [NEW] [config.ts](file:///Users/carlos/Desktop/interview_responder/src/config.ts)
* Create a centralized configuration parser that reads `import.meta.env.VITE_BACKEND_URL` (defaulting to `http://localhost:8000`) and exposes:
  * `WS_BASE` (pointing to `/ws`)
  * `WS_ANALYZE_URL` (pointing to `/api/ws/analyze-screens`)

#### [NEW] [audio-processor.js](file:///Users/carlos/Desktop/interview_responder/public/audio-processor.js)
* An `AudioWorkletProcessor` that:
  1. Downsamples the incoming media stream to 16kHz (automatically handled by the context).
  2. Converts Float32 audio samples into 16-bit Signed PCM (`linear16`).
  3. Sends the raw `pcmData` buffer back to the main thread via `postMessage`.

#### [NEW] [useAudioCapture.ts](file:///Users/carlos/Desktop/interview_responder/src/hooks/useAudioCapture.ts)
* A custom React hook that:
  * Wires up `navigator.mediaDevices.getUserMedia` for microphone audio.
  * Spawns an `AudioContext` at 16000Hz.
  * Registers `audio-processor.js` as an `AudioWorklet`.
  * Provides `startRecording(onFrame: (data: ArrayBuffer) => void)` and `stopRecording()`.

#### [MODIFY] [useWebSocket.ts](file:///Users/carlos/Desktop/interview_responder/src/hooks/useWebSocket.ts)
* Replace hardcoded URLs with constants from `src/config.ts`.
* Hook into `useAudioCapture` inside the React hook.
* Monitor `status` updates:
  * If the status changes to `"listening"`, trigger `startRecording(frame => ws.send(frame))`.
  * If the status transitions to any other state (e.g. `"thinking"`, `"paused"`, `"idle"`), trigger `stopRecording()`.

#### [MODIFY] [ScreenPanel.tsx](file:///Users/carlos/Desktop/interview_responder/src/components/ScreenPanel.tsx)
* Replace the hardcoded `WS_ANALYZE_URL` with the one exposed by `src/config.ts`.

---

### 3. Tauri: macOS Permissions

#### [MODIFY] [tauri.conf.json](file:///Users/carlos/Desktop/interview_responder/src-tauri/tauri.conf.json)
* Under `bundle -> macOS`, add `infoPlist` config for `NSMicrophoneUsageDescription`.

---

## Verification Plan

### Automated Tests
* Validate frontend typescript: `npm run build` (`tsc -b`).

### Manual Verification
1. Run local dev backend: `poetry run uvicorn backend.main:app --reload` (confirming no `pyaudio` dependency required).
2. Start the Tauri developer app: `npm run tauri dev`
3. Click **Listen** to request microphone permissions in the Tauri window.
4. Speak into the microphone and verify that the transcription turns into text in the frontend UI.
5. Pause and resume to ensure WebSocket communication stops/resumes capturing audio.
6. Verify screen capture vision analysis still works on the dynamic WS port.
