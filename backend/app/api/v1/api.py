from fastapi import APIRouter

from app.api.v1.endpoints import (
    agents,
    auth,
    chain_of_custody,
    collectors,
    devices,
    evidence,
    incidents,
    jobs,
    settings,
    status,
    templates,
    users,
)

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(incidents.router, prefix="/incidents", tags=["incidents"])
api_router.include_router(devices.router, prefix="/devices", tags=["devices"])
api_router.include_router(templates.router, prefix="/templates", tags=["templates"])
api_router.include_router(evidence.router, prefix="/evidence", tags=["evidence"])
api_router.include_router(chain_of_custody.router, prefix="/chain-of-custody", tags=["chain-of-custody"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(collectors.router, prefix="/collectors", tags=["collectors"])
api_router.include_router(settings.router, prefix="/settings", tags=["settings"])
api_router.include_router(status.router, prefix="/status", tags=["status"])
api_router.include_router(agents.router, prefix="/agents", tags=["agents"])
api_router.include_router(jobs.router, prefix="/jobs", tags=["jobs"])
