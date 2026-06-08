import logging
import os
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException

logger = logging.getLogger(__name__)
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, get_db, require_roles
from app.crud.settings import get_settings, upsert_settings
from app.models.user import User
from app.services.audit_log_service import safe_record_event
from app.schemas.settings import SystemSettingsApiOut, SystemSettingsCreate, SystemSettingsOut
from app.services.audit_log_service import safe_record_event
from app.crud.audit_log import prune_old_entries
from app.services.system_settings_service import get_runtime_settings, set_runtime_settings

router = APIRouter()

# Keep in sync with _EZ_TOOLS_DLLS in artifact_parser_service.py
_EZ_DLLS: dict[str, str] = {
    "EvtxECmd": "EvtxECmd/EvtxECmd.dll",
    "MFTECmd": "MFTECmd/MFTECmd.dll",
    "RECmd": "RECmd/RECmd.dll",
    "PECmd": "PECmd/PECmd.dll",
    "LECmd": "LECmd/LECmd.dll",
    "WxTCmd": "WxTCmd/WxTCmd.dll",
    "AmcacheParser": "AmcacheParser/AmcacheParser.dll",
    "SrumECmd": "SrumECmd/SrumECmd.dll",
    "AppCompatCacheParser": "AppCompatCacheParser/AppCompatCacheParser.dll",
    "SBECmd": "SBECmd/SBECmd.dll",
    "JLECmd": "JLECmd/JLECmd.dll",
    "RBCmd": "RBCmd/RBCmd.dll",
    "SQLECmd": "SQLECmd/SQLECmd.dll",
}


def _now_utc() -> str:
    return datetime.now(timezone.utc).isoformat()


def _check_exe(path: str | None) -> dict:
    ts = _now_utc()
    if not path:
        return {"ok": False, "status": "not_configured", "path": None, "last_validated_at": ts}
    p = Path(path)
    if not p.exists():
        return {"ok": False, "status": "not_found", "path": path, "last_validated_at": ts}
    if not os.access(p, os.X_OK):
        return {"ok": False, "status": "not_executable", "path": path, "last_validated_at": ts}
    return {"ok": True, "status": "ok", "path": path, "last_validated_at": ts}


def _check_dir(path: str | None) -> dict:
    ts = _now_utc()
    if not path:
        return {"ok": False, "status": "not_configured", "path": None, "last_validated_at": ts}
    p = Path(path)
    if not p.is_dir():
        return {"ok": False, "status": "not_found", "path": path, "last_validated_at": ts}
    return {"ok": True, "status": "ok", "path": path, "last_validated_at": ts}


def _check_yara_dir(path: str | None) -> dict:
    base = _check_dir(path)
    if not base["ok"] or not path:
        return base
    try:
        _validate_yara_rules_dir(Path(path))
        return {**base, "status": "ok"}
    except ValueError as exc:
        return {**base, "ok": False, "status": "compile_error", "detail": str(exc)[:200]}


def _check_ez_tools(path: str | None) -> dict:
    """Check EZ Tools base directory AND each individual parser DLL."""
    ts = _now_utc()
    if not path:
        return {"ok": False, "status": "not_configured", "path": None, "last_validated_at": ts,
                "found_count": 0, "total_count": len(_EZ_DLLS), "dlls": {}}
    p = Path(path)
    if not p.is_dir():
        return {"ok": False, "status": "not_found", "path": path, "last_validated_at": ts,
                "found_count": 0, "total_count": len(_EZ_DLLS), "dlls": {}}
    dlls: dict[str, dict] = {}
    for name, rel in _EZ_DLLS.items():
        dll_path = p / rel
        dlls[name] = {"found": dll_path.exists(), "path": str(dll_path)}
    found = sum(1 for d in dlls.values() if d["found"])
    status = "ok" if found == len(_EZ_DLLS) else ("partial" if found > 0 else "no_dlls_found")
    return {
        "ok": found > 0,
        "status": status,
        "path": path,
        "last_validated_at": ts,
        "found_count": found,
        "total_count": len(_EZ_DLLS),
        "dlls": dlls,
    }


def _validate_yara_rules_dir(yara_dir: Path) -> None:
    """Try to compile all .yar/.yara files in *yara_dir*.

    Raises ValueError with the first compilation error found so the admin
    knows which rule is malformed before it can crash the pipeline scanner.
    """
    try:
        import yara  # type: ignore[import]
    except ImportError:
        # yara-python not installed in this environment — skip validation
        logger.debug("yara-python not installed; skipping YARA rule pre-validation")
        return

    rule_files = list(yara_dir.glob("**/*.yar")) + list(yara_dir.glob("**/*.yara"))
    if not rule_files:
        return  # no rules to validate

    for rule_path in rule_files:
        try:
            yara.compile(str(rule_path))
        except yara.SyntaxError as exc:
            raise ValueError(
                f"YARA rule compile error in {rule_path.name}: {exc}"
            ) from exc
        except Exception as exc:
            raise ValueError(
                f"YARA rule validation failed for {rule_path.name}: {exc}"
            ) from exc


@router.get("/", response_model=SystemSettingsApiOut | None, dependencies=[Depends(require_roles("admin"))])
async def get_system_settings(db: AsyncSession = Depends(get_db)) -> SystemSettingsApiOut | None:
    settings = await get_settings(db)
    if settings:
        return SystemSettingsApiOut.model_validate(settings)
    runtime = await get_runtime_settings(db)
    return SystemSettingsApiOut(**runtime.__dict__)


@router.put("/", response_model=SystemSettingsApiOut, dependencies=[Depends(require_roles("admin"))])
async def put_system_settings(
    payload: SystemSettingsCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SystemSettingsApiOut:
    storage_path = Path(payload.evidence_storage_path.strip())
    if not storage_path.is_absolute():
        raise HTTPException(status_code=400, detail="evidence_storage_path must be an absolute path")
    if storage_path.exists() and not os.access(storage_path, os.W_OK):
        raise HTTPException(status_code=400, detail="evidence_storage_path exists but is not writable")
    # Numeric range checks for fields not covered by schema-level Field constraints.
    if payload.session_timeout_min <= 0:
        raise HTTPException(status_code=400, detail="session_timeout_min must be greater than 0")
    if payload.max_failed_logins < 0:
        raise HTTPException(status_code=400, detail="max_failed_logins cannot be negative")
    if payload.log_retention_days < 0:
        raise HTTPException(status_code=400, detail="log_retention_days cannot be negative")
    if payload.hash_algorithm.upper() not in {"SHA-256", "SHA-1"}:
        raise HTTPException(status_code=400, detail="hash_algorithm must be SHA-256 or SHA-1")
    if payload.export_format.upper() != "ZIP":
        raise HTTPException(status_code=400, detail="export_format must be ZIP")
    # timesketch_url is validated at the schema level; this guard makes the HTTP
    # error message explicit for API consumers that bypass schema validation.
    if payload.timesketch_url and not payload.timesketch_url.startswith(("http://", "https://")):
        raise HTTPException(status_code=400, detail="timesketch_url must start with http:// or https://")

    # YARA rule pre-validation: attempt to compile rules before accepting the path.
    # This prevents the pipeline from failing later with cryptic YARA parse errors.
    if payload.yara_rules_path:
        yara_dir = Path(payload.yara_rules_path)
        if yara_dir.is_dir():
            try:
                _validate_yara_rules_dir(yara_dir)
            except ValueError as exc:
                raise HTTPException(status_code=400, detail=str(exc)) from exc

    current = await get_settings(db)
    settings = await upsert_settings(db, payload)
    settings_out = SystemSettingsOut.model_validate(settings)
    set_runtime_settings(settings_out)
    try:
        await prune_old_entries(db, settings_out.log_retention_days)
    except Exception as exc:
        logger.warning("Failed to prune old audit log entries: %s", exc)
    changed_keys = []
    if current:
        for key, value in payload.model_dump().items():
            if getattr(current, key) != value:
                changed_keys.append(key)
    else:
        changed_keys = list(payload.model_dump().keys())
    await safe_record_event(
        db,
        event_type="admin_settings_changed",
        actor_type="user",
        actor_id=current_user.id,
        source="backend",
        action="update settings",
        target_type="settings",
        target_id=settings.id if settings else None,
        status="success",
        message="System settings updated",
        metadata={"changed": changed_keys},
    )
    return SystemSettingsApiOut.model_validate(settings)


_TOOL_VERIFY_MAP = {"ez_tools", "chainsaw", "hayabusa", "sigma_rules", "yara_rules"}


def _build_tool_results(settings) -> dict:
    return {
        "ez_tools": _check_ez_tools(settings.ez_tools_path),
        "chainsaw": _check_exe(settings.chainsaw_path),
        "hayabusa": _check_exe(settings.hayabusa_path),
        "sigma_rules": _check_dir(settings.sigma_rules_path),
        "yara_rules": _check_yara_dir(settings.yara_rules_path),
    }


@router.get("/tools-health", dependencies=[Depends(require_roles("admin", "operator"))])
async def tools_health_endpoint(db: AsyncSession = Depends(get_db)) -> dict:
    """Lightweight path-existence check for all configured tools (no subprocess)."""
    settings = await get_runtime_settings(db)

    def _quick(path: str | None) -> str:
        if not path:
            return "not_configured"
        return "ok" if Path(path).exists() else "not_found"

    ez_path = settings.ez_tools_path
    ez_found = 0
    ez_status = "not_configured"
    if ez_path:
        ez_dir = Path(ez_path)
        if ez_dir.is_dir():
            ez_found = sum(1 for rel in _EZ_DLLS.values() if (ez_dir / rel).exists())
            ez_status = (
                "ok" if ez_found == len(_EZ_DLLS)
                else ("partial" if ez_found > 0 else "no_dlls_found")
            )
        else:
            ez_status = "not_found"

    tools = {
        "ez_tools": {"status": ez_status, "dlls_found": ez_found, "dlls_total": len(_EZ_DLLS)},
        "chainsaw": {"status": _quick(settings.chainsaw_path)},
        "hayabusa": {"status": _quick(settings.hayabusa_path)},
        "sigma_rules": {"status": _quick(settings.sigma_rules_path)},
        "yara_rules": {"status": _quick(settings.yara_rules_path)},
    }
    statuses = [t["status"] for t in tools.values()]
    if all(s == "not_configured" for s in statuses):
        overall = "not_configured"
    elif any(s in ("not_found", "no_dlls_found", "not_executable") for s in statuses):
        overall = "broken" if not any(s in ("ok", "partial") for s in statuses) else "partial"
    elif any(s == "partial" for s in statuses):
        overall = "partial"
    else:
        overall = "healthy"

    return {"overall": overall, "tools": tools}


@router.post("/verify-tools", dependencies=[Depends(require_roles("admin"))])
async def verify_tools_endpoint(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Check whether each configured forensics tool path exists on the server."""
    settings = await get_runtime_settings(db)
    result = _build_tool_results(settings)
    all_ok = all(v["ok"] for v in result.values())
    await safe_record_event(
        db,
        event_type="tools_verified",
        actor_type="user",
        actor_id=current_user.id,
        source="backend",
        action="verify forensics tools",
        target_type="settings",
        target_id="system",
        status="success" if all_ok else "failure",
        message="Forensics tool verification completed",
        metadata={"results": {k: v["status"] for k, v in result.items()}},
    )
    return result


@router.post("/verify-tools/{tool_key}", dependencies=[Depends(require_roles("admin"))])
async def verify_single_tool_endpoint(
    tool_key: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Verify a single forensics tool by key."""
    if tool_key not in _TOOL_VERIFY_MAP:
        raise HTTPException(status_code=400, detail=f"Unknown tool key '{tool_key}'. Valid keys: {sorted(_TOOL_VERIFY_MAP)}")
    settings = await get_runtime_settings(db)
    checkers = {
        "ez_tools": lambda: _check_ez_tools(settings.ez_tools_path),
        "chainsaw": lambda: _check_exe(settings.chainsaw_path),
        "hayabusa": lambda: _check_exe(settings.hayabusa_path),
        "sigma_rules": lambda: _check_dir(settings.sigma_rules_path),
        "yara_rules": lambda: _check_yara_dir(settings.yara_rules_path),
    }
    result = checkers[tool_key]()
    await safe_record_event(
        db,
        event_type="tool_verified",
        actor_type="user",
        actor_id=current_user.id,
        source="backend",
        action=f"verify tool: {tool_key}",
        target_type="settings",
        target_id=tool_key,
        status="success" if result["ok"] else "failure",
        message=f"Tool verification: {tool_key} → {result['status']}",
    )
    return result
