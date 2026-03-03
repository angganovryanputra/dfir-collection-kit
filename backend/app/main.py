import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

from app.api.v1.api import api_router
from app.core.config import settings

logger = logging.getLogger(__name__)

# Secrets that indicate an unconfigured deployment
_INSECURE_DEFAULTS = {
    "change-me",
    "local-dev-secret",
    "local-agent-secret",
    "secret",
    "password",
    "dev-secret",
    "changeme",
    "default",
    "replace_with_strong_random_key",
    "replace_with_strong_random_secret",
}


def _validate_security_settings() -> None:
    if not settings.REQUIRE_AUTH:
        logger.warning("REQUIRE_AUTH is disabled — authentication is not enforced")
        return

    if settings.SECRET_KEY.lower() in _INSECURE_DEFAULTS:
        raise RuntimeError(
            f"SECRET_KEY is set to a known insecure default ('{settings.SECRET_KEY}'). "
            "Generate a strong random key and set it via the SECRET_KEY environment variable."
        )

    if not settings.AGENT_SHARED_SECRET:
        logger.warning("AGENT_SHARED_SECRET is not configured — all agent requests will be rejected")
    elif settings.AGENT_SHARED_SECRET.lower() in _INSECURE_DEFAULTS:
        logger.warning(
            "AGENT_SHARED_SECRET is set to a known insecure default ('%s'). "
            "Set a strong random secret before deploying to production.",
            settings.AGENT_SHARED_SECRET,
        )

    allowed_origins = [o.strip() for o in settings.ALLOWED_ORIGINS.split(",") if o.strip()]
    if not allowed_origins or "*" in allowed_origins:
        logger.warning(
            "CORS is configured to allow all origins ('*'). "
            "Set ALLOWED_ORIGINS to a comma-separated list of trusted origins for production."
        )


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Adds standard security headers to every response."""

    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("X-XSS-Protection", "1; mode=block")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault("X-Permitted-Cross-Domain-Policies", "none")
        return response


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
app.add_middleware(SecurityHeadersMiddleware)

app.include_router(api_router, prefix="/api/v1")
