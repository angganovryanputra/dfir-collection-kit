from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://dfir:dfir@localhost:5432/dfir"
    SECRET_KEY: str = "change-me"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    BACKEND_VERSION: str = "dev"

    class Config:
        env_file = ".env"


settings = Settings()
