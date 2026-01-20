from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://dfir:dfir@localhost:5432/dfir"
    SECRET_KEY: str = "change-me"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    BACKEND_VERSION: str = "dev"
    ALLOWED_ORIGINS: str = "*"
    EVIDENCE_STORAGE_PATH: str = "/vault/evidence"
    MAX_UPLOAD_SIZE_MB: int = 10240
    MAX_EXPORT_SIZE_MB: int = 2048
    MAX_EXPORTS_PER_INCIDENT: int = 5
    AGENT_SHARED_SECRET: str = ""
    REQUIRE_AUTH: bool = True

    class Config:
        env_file = ".env"


settings = Settings()
