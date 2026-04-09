from __future__ import annotations

import hashlib
import os
import zipfile
from pathlib import Path

from fastapi import HTTPException, UploadFile

# Maximum total uncompressed size allowed per ZIP (50 GB)
_MAX_EXTRACT_BYTES = 50 * 1024 * 1024 * 1024
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
    resolved_output_dir = output_dir.resolve()

    with zipfile.ZipFile(zip_path, "r") as zip_ref:
        total_bytes_extracted = 0

        for member in zip_ref.infolist():
            # Path traversal protection: resolve the target path and confirm it stays
            # within the output directory before extracting anything.
            raw_target = (output_dir / member.filename).resolve()
            if not str(raw_target).startswith(str(resolved_output_dir) + os.sep) and raw_target != resolved_output_dir:
                raise ValueError("ZIP contains path traversal entry")

            if member.is_dir():
                ensure_directory(raw_target)
                continue
            ensure_directory(raw_target.parent)

            # Stream extraction — never load the full member into RAM.
            with zip_ref.open(member) as source, raw_target.open("wb") as dest:
                buf = source.read(_COPY_CHUNK)
                while buf:
                    total_bytes_extracted += len(buf)
                    # ZIP bomb protection: abort if cumulative extracted bytes exceed the limit.
                    if total_bytes_extracted > _MAX_EXTRACT_BYTES:
                        raise ValueError("ZIP extraction exceeds size limit")
                    dest.write(buf)
                    buf = source.read(_COPY_CHUNK)

            extracted.append(raw_target)
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
