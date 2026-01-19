from __future__ import annotations

import hashlib
import os
import zipfile
from pathlib import Path

from fastapi import HTTPException, UploadFile


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
    extracted: list[Path] = []
    ensure_directory(output_dir)
    with zipfile.ZipFile(zip_path, "r") as zip_ref:
        for member in zip_ref.infolist():
            member_path = Path(member.filename)
            if member_path.is_absolute() or ".." in member_path.parts:
                raise HTTPException(status_code=400, detail="Invalid zip contents")
            target = safe_join(output_dir, member.filename)
            if member.is_dir():
                ensure_directory(target)
                continue
            ensure_directory(target.parent)
            with zip_ref.open(member) as source, target.open("wb") as dest:
                dest.write(source.read())
            extracted.append(target)
    return extracted


def hash_file(path: Path) -> str:
    hasher = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            hasher.update(chunk)
    return hasher.hexdigest()


def write_hash_manifest(files: list[Path], manifest_path: Path, base_dir: Path) -> None:
    ensure_directory(manifest_path.parent)
    with manifest_path.open("w", encoding="utf-8") as handle:
        for file_path in files:
            digest = hash_file(file_path)
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
