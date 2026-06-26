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


settings = Settings()
