"""Resolve the published snapshot and normalize rows for timeline consumers."""

import json
from datetime import datetime, timezone
from pathlib import Path

from fastapi import HTTPException


async def published_timeline_path(db, incident_id: str) -> Path:
    from app.crud.super_timeline import get_super_timeline_by_incident

    timeline = await get_super_timeline_by_incident(db, incident_id)
    if not timeline or timeline.status != "DONE" or not timeline.duckdb_path:
        raise HTTPException(404, "Build the incident Super Timeline before using this feature")
    path = Path(timeline.duckdb_path)
    if not path.is_file():
        raise HTTPException(404, "Published Super Timeline file is unavailable")
    return path


def normalize_timeline_row(row: dict) -> dict:
    result = dict(row)
    raw = result.get("extra")
    if isinstance(raw, str):
        try:
            result["extra"] = json.loads(raw)
        except ValueError:
            pass
    timestamp = result.pop("event_dt", None) or result.get("datetime")
    if isinstance(timestamp, str):
        try:
            timestamp = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
        except ValueError:
            timestamp = None
    if isinstance(timestamp, datetime):
        if timestamp.tzinfo is None:
            timestamp = timestamp.replace(tzinfo=timezone.utc)
        result["datetime"] = timestamp.astimezone(timezone.utc).isoformat()
    else:
        result["datetime"] = None
    return result
