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
    REDIS_URL: str = ""
    # Comma-separated trusted SIEM hostnames.  Required when a SIEM resolves
    # to RFC1918 space; user-supplied URLs alone can never bypass SSRF checks.
    SIEM_ALLOWED_HOSTS: str = ""
    # Separate key permits CoC signing-key rotation without invalidating JWTs.
    # If unset, SECRET_KEY is used for backwards-compatible secure signing.
    CHAIN_OF_CUSTODY_SIGNING_KEY: str = ""
    REQUIRE_AUTH: bool = True

    class Config:
        env_file = ".env"


settings = Settings()
