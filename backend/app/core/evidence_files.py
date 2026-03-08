from __future__ import annotations

import hashlib
import os
import zipfile
from pathlib import Path

from fastapi import HTTPException, UploadFile

# Maximum total uncompressed size allowed per ZIP (2 GB)
_MAX_UNCOMPRESSED_BYTES = 2 * 1024 * 1024 * 1024
# Streaming copy chunk size (4 MB)
_COPY_CHUNK = 4 * 1024 * 1024


def ensure_directory(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def safe_join(base: Path, *paths: str) -> Path:
    target = base.joinpath(*paths).resolve()
    if not str(target).startswith(str(base.resolve())):
        raise HTTPException(status_code=400, detail="Invalid path traversal attempt")
    return target


def save_upload(file: UploadFile, destination: Path, max_bytes: int) -> int:
    total = 0
    ensure_directory(destination.parent)
    with destination.open("wb") as handle:
        while True:
            chunk = file.file.read(1024 * 1024)
            if not chunk:
                break
            total += len(chunk)
            if total > max_bytes:
                raise HTTPException(status_code=413, detail="Upload exceeds size limit")
            handle.write(chunk)
    return total


def extract_zip(zip_path: Path, output_dir: Path) -> list[Path]:
    """Extract a ZIP archive with path traversal and decompression bomb protection."""
    extracted: list[Path] = []
    ensure_directory(output_dir)

    with zipfile.ZipFile(zip_path, "r") as zip_ref:
        # Pre-check: reject if total uncompressed size is excessive (decompression bomb)
        total_uncompressed = sum(m.file_size for m in zip_ref.infolist())
        if total_uncompressed > _MAX_UNCOMPRESSED_BYTES:
            raise HTTPException(
                status_code=413,
                detail=f"ZIP uncompressed content exceeds {_MAX_UNCOMPRESSED_BYTES // (1024**3)} GB limit",
            )

        for member in zip_ref.infolist():
            member_path = Path(member.filename)
            # Reject absolute paths, parent traversal, and null bytes
            if (
                member_path.is_absolute()
                or ".." in member_path.parts
                or "\x00" in member.filename
            ):
                raise HTTPException(status_code=400, detail="Invalid zip contents: path traversal detected")

            target = safe_join(output_dir, member.filename)
            if member.is_dir():
                ensure_directory(target)
                continue
            ensure_directory(target.parent)

            # Stream extraction — never load full file into RAM
            with zip_ref.open(member) as source, target.open("wb") as dest:
                written = 0
                buf = source.read(_COPY_CHUNK)
                while buf:
                    written += len(buf)
                    if written > _MAX_UNCOMPRESSED_BYTES:
                        raise HTTPException(status_code=413, detail="ZIP member exceeds size limit")
                    dest.write(buf)
                    buf = source.read(_COPY_CHUNK)

            extracted.append(target)
    return extracted


def _normalize_algorithm(value: str | None) -> str:
    if not value:
        return "sha256"
    normalized = value.strip().lower().replace("-", "")
    if normalized in {"sha256", "sha-256"}:
        return "sha256"
    if normalized in {"sha1", "sha-1"}:
        return "sha1"
    return "sha256"


def hash_file(path: Path, algorithm: str | None = None) -> str:
    hasher = hashlib.new(_normalize_algorithm(algorithm))
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            hasher.update(chunk)
    return hasher.hexdigest()


def write_hash_manifest(
    files: list[Path],
    manifest_path: Path,
    base_dir: Path,
    algorithm: str | None = None,
) -> None:
    ensure_directory(manifest_path.parent)
    with manifest_path.open("w", encoding="utf-8") as handle:
        for file_path in files:
            digest = hash_file(file_path, algorithm)
            rel = str(file_path.relative_to(base_dir))
            handle.write(f"{digest}  {rel}\n")


def append_chain_log(log_path: Path, line: str) -> None:
    ensure_directory(log_path.parent)
    with log_path.open("a", encoding="utf-8") as handle:
        handle.write(f"{line}\n")


def write_lock_marker(lock_path: Path) -> None:
    ensure_directory(lock_path.parent)
    with lock_path.open("w", encoding="utf-8") as handle:
        handle.write("LOCKED\n")
