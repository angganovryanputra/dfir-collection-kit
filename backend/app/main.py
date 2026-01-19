from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.api import api_router
from app.core.config import settings


def _validate_security_settings() -> None:
    if settings.REQUIRE_AUTH and settings.SECRET_KEY == "change-me":
        raise RuntimeError("SECRET_KEY must be configured when REQUIRE_AUTH is enabled")


@asynccontextmanager
async def lifespan(app: FastAPI):
    _validate_security_settings()
    yield


app = FastAPI(title="DFIR Backend", lifespan=lifespan)

allowed_origins = [origin.strip() for origin in settings.ALLOWED_ORIGINS.split(",") if origin.strip()]
allow_origins = allowed_origins or ["*"]
allow_credentials = False if "*" in allow_origins else True
app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api/v1")
