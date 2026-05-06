import asyncio
import json
import os
from pathlib import Path

# Set up environment variables that the app expects
os.environ["DATABASE_URL"] = "postgresql+asyncpg://dfir:dfir123@db:5432/dfir"
os.environ["SECRET_KEY"] = "test-secret"
os.environ["AGENT_SHARED_SECRET"] = "agent-secret"
os.environ["EVIDENCE_STORAGE_PATH"] = "/vault/evidence"
os.environ["CELERY_BROKER_URL"] = "redis://redis:6379/0"
os.environ["CELERY_RESULT_BACKEND"] = "redis://redis:6379/0"

from app.db.session import AsyncSessionLocal
from app.models.case import Case, CaseStatus
from app.models.endpoint import Endpoint
from app.services.super_timeline_service import build_super_timeline_background

async def main():
    print("Starting integration test...")
    async with AsyncSessionLocal() as db:
        # Create Case
        case = Case(name="Test Case", description="Integration Test", status=CaseStatus.OPEN)
        db.add(case)
        await db.commit()
        await db.refresh(case)
        print(f"Created Case: {case.id}")

        # Create Endpoint
        endpoint = Endpoint(case_id=case.id, hostname="TEST-PC", mac_address="00:11:22:33:44:55", ip_address="10.0.0.1")
        db.add(endpoint)
        await db.commit()
        await db.refresh(endpoint)
        print(f"Created Endpoint: {endpoint.id}")

        # Simulate Artifact Upload to Disk
        # The background worker expects timeline.jsonl in EVIDENCE_STORAGE_PATH/case_id/endpoint_id/timeline.jsonl
        # or something similar. Let's create dummy timeline.jsonl
        evidence_dir = Path(os.environ["EVIDENCE_STORAGE_PATH"]) / str(case.id) / str(endpoint.id) / "super_timeline"
        evidence_dir.mkdir(parents=True, exist_ok=True)
        
        timeline_file = evidence_dir / "timeline.jsonl"
        with open(timeline_file, "w") as f:
            f.write(json.dumps({"Timestamp": "2023-01-01T10:00:00", "Message": "TargetUserName: admin", "Source": "EVTX", "EventID": 4624}) + "\n")
            f.write(json.dumps({"Timestamp": "2023-01-01T10:05:00", "Message": "executed malware", "Source": "PREFETCH"}) + "\n")
            
        print(f"Wrote dummy data to {timeline_file}")
        
        # Trigger background task directly (synchronously to verify logic)
        print("Running build_super_timeline_background...")
        result = await build_super_timeline_background(str(case.id))
        print(f"Timeline Result: {result}")
        
        # Verify duckdb output
        duckdb_path = Path(os.environ["EVIDENCE_STORAGE_PATH"]) / str(case.id) / "super_timeline.duckdb"
        if duckdb_path.exists():
            print(f"Success: DuckDB file created at {duckdb_path}")
            
            import duckdb
            con = duckdb.connect(str(duckdb_path), read_only=True)
            res = con.execute("SELECT COUNT(*) FROM timeline_events").fetchone()
            print(f"Total events in DuckDB: {res[0]}")
            
            lat = con.execute("SELECT * FROM lateral_movement_detections").fetchall()
            print(f"Lateral movement detections: {len(lat)}")
            con.close()
        else:
            print("Error: DuckDB file not found!")

if __name__ == "__main__":
    asyncio.run(main())
