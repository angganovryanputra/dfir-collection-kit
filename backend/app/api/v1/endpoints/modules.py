from typing import Any

from fastapi import APIRouter, Depends, Query

from app.core.deps import get_current_user
from app.core.modules import (
    COLLECTION_PROFILES,
    MODULE_REGISTRY,
    get_modules_by_category,
    get_profile_modules,
    normalize_os_name,
)
from app.models.user import User

router = APIRouter()


@router.get("")
async def list_modules(
    os: str | None = Query(default=None, description="Filter by OS: 'windows' or 'linux'"),
    _: User = Depends(get_current_user),
) -> dict[str, Any]:
    """
    Return all registered collection modules grouped by category.

    Each entry includes: id, os, category, priority, output_relpath.
    Pass ?os=windows, ?os=linux, or ?os=macos to restrict to a single platform.
    Darwin/Mac OS X strings are normalised to 'macos' automatically.
    """
    grouped = get_modules_by_category(os)
    return {"modules": grouped}


@router.get("/profiles")
async def list_profiles(
    _: User = Depends(get_current_user),
) -> dict[str, Any]:
    """
    Return all available collection profiles (KAPE-style compound targets).

    Each profile contains label, description, and module lists per OS.
    """
    profiles = []
    for profile_id, profile in COLLECTION_PROFILES.items():
        profiles.append(
            {
                "id": profile_id,
                "label": profile["label"],
                "description": profile["description"],
                "module_counts": {
                    os_name: len(mods) for os_name, mods in profile["modules"].items()
                },
            }
        )
    return {"profiles": profiles}


@router.get("/profiles/{profile_id}")
async def get_profile(
    profile_id: str,
    os: str = Query(..., description="Target OS: 'windows', 'linux', or 'macos' (darwin accepted)"),
    _: User = Depends(get_current_user),
) -> dict[str, Any]:
    """
    Return the module list for a specific profile and OS.

    Use this to pre-populate the collection module selector with a profile's modules.
    """
    normalized_os = normalize_os_name(os)
    module_ids = get_profile_modules(profile_id, os)

    modules_detail = []
    for module_id in module_ids:
        entry = MODULE_REGISTRY[module_id]
        modules_detail.append(
            {
                "id": module_id,
                "os": entry["os"],
                "category": entry["category"],
                "priority": entry["priority"],
                "output_relpath": entry["output_relpath"],
            }
        )

    profile = COLLECTION_PROFILES[profile_id]
    return {
        "profile_id": profile_id,
        "label": profile["label"],
        "os": normalized_os,
        "modules": modules_detail,
    }
