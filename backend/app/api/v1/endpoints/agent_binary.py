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

_VALID_OS = {"windows", "linux"}
_VALID_ARCH = {"amd64", "arm64", "x86"}


@router.get("/download")
async def download_agent_binary(
    os: str = Query(..., description="Target OS: windows or linux"),
    arch: str = Query(default="amd64", description="Architecture: amd64, arm64, or x86"),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> FileResponse:
    """Download the pre-built agent binary for the given OS and architecture.

    Binaries must be placed in the directory configured via Settings → Agent Binary Path.
    Expected filenames:
      agent-windows-amd64.exe
      agent-linux-amd64
      agent-linux-arm64
    """
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
            detail=(
                "Agent binary path not configured. "
                "Set it in Admin Settings → Agent Binary Path."
            ),
        )

    binary_dir = Path(binary_base)
    if not binary_dir.is_dir():
        raise HTTPException(
            status_code=503,
            detail=f"Agent binary directory not found: {binary_base}",
        )

    ext = ".exe" if os_lower == "windows" else ""
    # Accept both naming conventions:
    #   dfir-agent-<os>-<arch>.exe  (Makefile output)
    #   agent-<os>-<arch>.exe       (legacy)
    candidates = [
        f"dfir-agent-{os_lower}-{arch_lower}{ext}",
        f"agent-{os_lower}-{arch_lower}{ext}",
    ]
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
                f"Build with: cd agent && make {os_lower}  "
                f"then copy the binary here."
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
        return {"configured": False, "available": []}

    binary_dir = Path(binary_base)
    available = []
    for os_name in _VALID_OS:
        for arch in _VALID_ARCH:
            ext = ".exe" if os_name == "windows" else ""
            fname = f"agent-{os_name}-{arch}{ext}"
            if (binary_dir / fname).exists():
                available.append({"os": os_name, "arch": arch, "filename": fname})

    return {"configured": True, "binary_path": binary_base, "available": available}
