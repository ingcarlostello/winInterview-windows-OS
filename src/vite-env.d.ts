/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Base URL of the Python backend (no trailing slash), baked at build time.
   * The WS endpoints are derived as `${VITE_BACKEND_WS_URL}/ws` and
   * `${VITE_BACKEND_WS_URL}/api/ws/analyze-screens`.
   * - dev:        ws://localhost:8000
   * - staging:    wss://api-dev.wininterview.xyz
   * - production: wss://api.wininterview.xyz
   */
  readonly VITE_BACKEND_WS_URL?: string;
  /** Convex deployment URL (public). */
  readonly VITE_CONVEX_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
