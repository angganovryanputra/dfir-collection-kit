import asyncio
from pathlib import Path
from datetime import datetime
import json
import duckdb
from app.services.super_timeline_service import _detect_lateral_movement

# Create mock DuckDB
duckdb_path = Path("/app/mock.duckdb")
if duckdb_path.exists(): duckdb_path.unlink()
con = duckdb.connect(str(duckdb_path))
con.execute("""
    CREATE TABLE timeline_events (
        row_id         BIGINT,
        host           VARCHAR,
        job_id         VARCHAR,
        event_dt       TIMESTAMP,
        message        VARCHAR,
        timestamp_desc VARCHAR,
        source         VARCHAR,
        source_short   VARCHAR,
        incident_id    VARCHAR,
        extra          JSON
    )
""")

# Insert mock lateral movement
events = [
    # Account Pivot
    (1, "HOST1", "J1", "2023-01-01 10:00:00", "TargetUserName: hacker1", "Logon", "EVTX", "EVTX", "INC1", "{}"),
    (2, "HOST2", "J2", "2023-01-01 12:00:00", "TargetUserName: hacker1", "Logon", "EVTX", "EVTX", "INC1", "{}"),
    # Process spread
    (3, "HOST1", "J1", "2023-01-01 10:00:00", "executed malware.exe", "Prefetch", "PREFETCH", "PREFETCH", "INC1", "{}"),
    (4, "HOST2", "J2", "2023-01-01 10:10:00", "executed malware.exe", "Prefetch", "PREFETCH", "PREFETCH", "INC1", "{}"),
]

con.executemany("INSERT INTO timeline_events VALUES (?, ?, ?, CAST(? AS TIMESTAMP), ?, ?, ?, ?, ?, ?)", events)
con.close()

# Test
dets = _detect_lateral_movement(duckdb_path, "INC1", "SUPTL1")
for d in dets:
    print(d["detection_type"], d["source_host"], "->", d["target_host"], d["actor"])
