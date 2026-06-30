from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    deepgram_api_key: str = ""
    deepseek_api_key: str = ""
    minimax_api_key: str = ""
    clerk_jwks_url: str = ""
    # Convex (read directly from the environment by convex_client.py; declared
    # here for documentation/visibility). vite_convex_url is the *.convex.cloud
    # URL; the client derives the *.convex.site HTTP-actions URL from it.
    vite_convex_url: str = ""
    convex_backend_key: str = ""
    host: str = "0.0.0.0"
    port: int = 8000

    # Deployment environment: "dev" | "live". Drives logging/diagnostics only.
    app_env: str = "dev"
    # Comma-separated list of allowed browser/WebView origins for CORS + the
    # WebSocket Origin allowlist. Empty falls back to the local dev origin.
    # Example (prod): "http://tauri.localhost,tauri://localhost"
    allowed_origins: str = ""
    # When True, WebSocket handshakes whose Origin header is present but not in
    # the allowlist are rejected. Default False (log-only) so we can confirm the
    # real Tauri WebView Origin from logs before turning enforcement on.
    enforce_ws_origin: bool = False

    @property
    def allowed_origins_list(self) -> list[str]:
        origins = [o.strip() for o in self.allowed_origins.split(",") if o.strip()]
        return origins or ["http://localhost:5173"]


settings = Settings()
