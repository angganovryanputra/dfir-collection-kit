"""Resolve evidence by recorded provenance, never by an arbitrary first match."""

import hmac
import re
from pathlib import Path

from fastapi import HTTPException

from app.core.evidence_files import hash_file


def resolve_evidence_file(
    storage_path: str,
    incident_id: str,
    name: str,
    expected_hash: str,
    relative_path: str | None = None,
    job_id: str | None = None,
    algorithm: str | None = None,
) -> Path:
    root = (Path(storage_path) / incident_id).resolve()
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", incident_id):
        raise HTTPException(400, "Invalid incident identifier")
    if not expected_hash or not re.fullmatch(r"[0-9a-fA-F]+", expected_hash):
        raise HTTPException(409, "Evidence has no verifiable digest; repair provenance first")
    algorithm = (
        (
            algorithm
            or {32: "md5", 40: "sha1", 64: "sha256", 128: "sha512"}.get(len(expected_hash), "")
        )
        .lower()
        .replace("-", "")
    )
    if algorithm not in {"md5", "sha1", "sha256", "sha512"}:
        raise HTTPException(409, "Unsupported evidence digest")
    if relative_path:
        candidates = [root / relative_path]
    else:
        search_root = root
        if job_id:
            if not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", job_id):
                raise HTTPException(400, "Invalid job identifier")
            search_root = root / job_id
        # Legacy records require an unambiguous hash match, not a basename guess.
        candidates = (p for p in search_root.rglob("*") if p.name == name)
    matches = []
    for candidate in candidates:
        resolved = candidate.resolve()
        if job_id and (
            not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", job_id)
            or not resolved.is_relative_to(root / job_id)
        ):
            raise HTTPException(409, "Evidence path does not belong to its recorded collection job")
        if not resolved.is_relative_to(root) or "exports" in resolved.relative_to(root).parts:
            if relative_path:
                raise HTTPException(409, "Evidence path escapes its incident or targets an export")
            continue
        if not resolved.is_file():
            continue
        if hmac.compare_digest(hash_file(resolved, algorithm).lower(), expected_hash.lower()):
            matches.append(resolved)
            if len(matches) > 1:
                raise HTTPException(
                    409, "Ambiguous legacy evidence: multiple files share its name and digest"
                )
    if not matches:
        raise HTTPException(409, "Evidence missing or digest mismatch; export refused")
    return matches[0]
