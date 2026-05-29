from fastapi import APIRouter

from app.api.v1.endpoints import (
    agent_binary,
    agent_commands,
    agents,
    ai_analysis,
    auth,
    case_management,
    audit_logs,
    chain_of_custody,
    collectors,
    devices,
    evidence,
    incidents,
    jobs,
    modules,
    platform_features,
    processing,
    settings,
    status,
    templates,
    threat_intel,
    users,
)

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(audit_logs.router, prefix="/audit-logs", tags=["audit-logs"])
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
api_router.include_router(modules.router, prefix="/modules", tags=["modules"])
api_router.include_router(processing.router, prefix="/processing", tags=["processing"])
api_router.include_router(agent_binary.router, prefix="/agent-binary", tags=["agent-binary"])
api_router.include_router(platform_features.router, prefix="/platform", tags=["platform-features"])
api_router.include_router(agent_commands.router, prefix="/agent-commands", tags=["agent-commands"])
api_router.include_router(threat_intel.router, prefix="/threat-intel", tags=["threat-intel"])
api_router.include_router(ai_analysis.router, prefix="/ai", tags=["ai-analysis"])
api_router.include_router(case_management.router, prefix="/case", tags=["case-management"])
