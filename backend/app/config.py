from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "Pilotage Audit"
    environment: str = "development"

    database_url: str = "postgresql+psycopg2://audit:audit@db:5432/audit"

    secret_key: str = "change-me-in-production"
    access_token_expire_minutes: int = 60 * 8
    algorithm: str = "HS256"

    # Optional SSO / OIDC (disabled unless all values are provided)
    oidc_enabled: bool = False
    oidc_issuer: str | None = None
    oidc_client_id: str | None = None
    oidc_client_secret: str | None = None
    oidc_redirect_url: str | None = None

    uploads_dir: str = "/data/uploads"
    max_upload_size_mb: int = 50

    cors_origins: list[str] = ["http://localhost:5173", "http://localhost:9090"]


@lru_cache
def get_settings() -> Settings:
    return Settings()
