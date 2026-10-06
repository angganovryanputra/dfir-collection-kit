"""Agent binary download endpoint."""

from __future__ import annotations

import logging
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, get_db
from app.models.user import User
from app.services.system_settings_service import get_runtime_settings

logger = logging.getLogger(__name__)
router = APIRouter()

_VALID_OS = {"windows", "linux", "macos", "darwin"}
_VALID_ARCH = {"amd64", "arm64", "x86"}


def _candidate_filenames(os_lower: str, arch_lower: str) -> list[str]:
    norm_os = "macos" if os_lower in {"macos", "darwin"} else os_lower
    candidates: list[str] = []

    if norm_os == "windows":
        candidates.extend([
            f"dfir-agent-{norm_os}-{arch_lower}.exe",
            f"agent-{norm_os}-{arch_lower}.exe",
        ])
        if arch_lower in {"amd64", "x86"}:
            candidates.extend(["dfir-agent.exe", "agent.exe"])
    elif norm_os == "linux":
        candidates.extend([
            f"dfir-agent-{norm_os}-{arch_lower}",
            f"agent-{norm_os}-{arch_lower}",
        ])
        if arch_lower == "amd64":
            candidates.extend(["dfir-agent-linux", "agent-linux"])
        elif arch_lower == "arm64":
            candidates.extend(["dfir-agent-linux-arm64", "agent-linux-arm64"])
    elif norm_os == "macos":
        candidates.extend([
            f"dfir-agent-darwin-{arch_lower}",
            f"dfir-agent-macos-{arch_lower}",
            f"agent-darwin-{arch_lower}",
            f"agent-macos-{arch_lower}",
        ])
    return candidates


@router.get("/download")
async def download_agent_binary(
    os: str = Query(..., description="Target OS: windows, linux, or macos"),
    arch: str = Query(default="amd64", description="Architecture: amd64, arm64, or x86"),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> FileResponse:
    """Download the pre-built agent binary for the given OS and architecture."""
    os_lower = os.lower().strip()
    arch_lower = arch.lower().strip()

    if os_lower not in _VALID_OS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported OS '{os_lower}'. Must be one of: {', '.join(sorted(_VALID_OS))}",
        )
    if arch_lower not in _VALID_ARCH:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported arch '{arch_lower}'. Must be one of: {', '.join(sorted(_VALID_ARCH))}",
        )

    runtime = await get_runtime_settings(db)
    binary_base = getattr(runtime, "agent_binary_path", None) or ""

    if not binary_base:
        raise HTTPException(
            status_code=503,
            detail="Agent binary path not configured. Set it in Admin Settings → Agent Binary Path.",
        )

    binary_dir = Path(binary_base)
    if not binary_dir.is_dir():
        raise HTTPException(
            status_code=503,
            detail=f"Agent binary directory not found: {binary_base}",
        )

    candidates = _candidate_filenames(os_lower, arch_lower)
    binary_path = None
    filename = candidates[0]
    for candidate in candidates:
        p = binary_dir / candidate
        if p.exists():
            binary_path = p
            filename = candidate
            break

    if binary_path is None:
        raise HTTPException(
            status_code=404,
            detail=(
                f"Binary not found in {binary_base}. "
                f"Searched candidates: {', '.join(candidates)}. "
                f"Build with Makefile targets (e.g. make agent-all) then copy binaries there."
            ),
        )

    logger.info("Agent binary download: %s (%s)", filename, binary_path)
    return FileResponse(
        path=str(binary_path),
        filename=filename,
        media_type="application/octet-stream",
    )


@router.get("/info")
async def get_agent_info(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> dict:
    """Return which agent binaries are available for download."""
    runtime = await get_runtime_settings(db)
    binary_base = getattr(runtime, "agent_binary_path", None) or ""

    if not binary_base or not Path(binary_base).is_dir():
        return {
            "configured": False,
            "available": [],
            "windows_amd64": False,
            "linux_amd64": False,
            "linux_arm64": False,
            "macos_arm64": False,
            "macos_amd64": False,
        }

    binary_dir = Path(binary_base)
    available: list[dict] = []
    found_targets: set[str] = set()

    check_targets = [
        ("windows", "amd64"),
        ("linux", "amd64"),
        ("linux", "arm64"),
        ("macos", "arm64"),
        ("macos", "amd64"),
    ]

    for os_name, arch in check_targets:
        for fname in _candidate_filenames(os_name, arch):
            if (binary_dir / fname).exists():
                available.append({"os": os_name, "arch": arch, "filename": fname})
                found_targets.add(f"{os_name}_{arch}")
                break

    return {
        "configured": True,
        "binary_path": binary_base,
        "available": available,
        "windows_amd64": "windows_amd64" in found_targets,
        "linux_amd64": "linux_amd64" in found_targets,
        "linux_arm64": "linux_arm64" in found_targets,
        "macos_arm64": "macos_arm64" in found_targets,
        "macos_amd64": "macos_amd64" in found_targets,
    }
