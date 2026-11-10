# Design Spec: Phase 3 Performance, Reliability & Enterprise Polish

**Date**: 2026-11-10  
**Status**: APPROVED  
**Target Branch**: `feat/phase3-performance-and-polish`  
**Parent Commit**: `32672e2` (`main`)  

---

## 1. Overview & Objectives

Phase 3 addresses all remaining high-impact performance bottlenecks, forensic integrity gaps, agent network compatibility issues, and frontend dead ends identified in the codebase review:

1. **BE-GAP-08 (Celery Queue Segregation)**: Segregate long-running forensics tasks (up to 2h) from periodic cron tasks (60s) to eliminate worker queue starvation.
2. **BE-GAP-09 (User Model Timestamps)**: Migrate `User.last_login` and `User.created_at` from `VARCHAR` to `TIMESTAMP WITH TIME ZONE` with a backward-compatible Alembic migration.
3. **AG-GAP-02 (VSS Mutex Synchronization)**: Prevent concurrent VSS snapshot collisions in Windows artifact collectors with package-level serialization.
4. **AG-GAP-06 (On-Device SHA-256 Manifest)**: Generate per-file SHA-256 hash manifest at point of capture on endpoint prior to archive packaging (ISO/IEC 27037 & NIST SP 800-86).
5. **AG-GAP-07 (Agent Upload Content-Length)**: Provide explicit `Content-Length` on multipart ZIP uploads to satisfy strict corporate egress proxies and WAFs.
6. **FE-GAP-08 (Dashboard Purge Handler)**: Implement safe confirmation and deletion execution for `PURGE_SECTOR` bulk action on dashboard.
7. **FE-GAP-09 (Full Audit Log CSV Export)**: Fetch all filtered audit records rather than truncating to current visible page (50 rows).
8. **FE-GAP-10 (Legacy Cleanup)**: Remove orphaned `TimelineExplorer.tsx` component.
9. **Performance Polish**: Implement read-only DuckDB connection cache and 24-hour Redis caching for Threat Intel API enrichments (VirusTotal & MISP).

---

## 2. Technical Design & Architecture

### 2.1 Celery Queue Routing (`BE-GAP-08`)
- In `backend/app/worker.py`:
  - Define named queues: `default`, `forensics`, `periodic`.
  - Configure `task_routes`:
    - `dfir.run_pipeline` -> `{"queue": "forensics"}`
    - `dfir.process_s3_upload` -> `{"queue": "forensics"}`
    - `dfir.run_super_timeline` -> `{"queue": "forensics"}`
    - `dfir.run_scheduled_collection` -> `{"queue": "forensics"}`
    - `dfir.check_scheduled_collections` -> `{"queue": "periodic"}`
    - `dfir.expire_legal_holds` -> `{"queue": "periodic"}`
    - `dfir.verify_evidence_integrity` -> `{"queue": "periodic"}`
  - Configure `celery_app.conf.task_queues` to declare `Queue("default")`, `Queue("forensics")`, `Queue("periodic")`.
  - In `docker-compose.yml`, run worker with `-Q default,forensics,periodic` allowing unified execution in single-worker deployments while enabling multi-worker scaling in enterprise clusters.

### 2.2 User Timestamp Migration (`BE-GAP-09`)
- In `backend/app/models/user.py`:
  - `last_login: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)`
  - `created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())`
- In `backend/app/schemas/user.py`:
  - `last_login: datetime | str | None = None`
  - `created_at: datetime | str`
- In `backend/app/crud/user.py`:
  - On user creation, `last_login=None`, `created_at=datetime.now(timezone.utc)`.
  - On `update_last_login`, set `user.last_login = datetime.now(timezone.utc)`.
- Alembic migration `20260915_user_datetime_migration.py`:
  - Down revision: `20260914_case_investigation`.
  - Safe cast for `last_login`: `CASE WHEN last_login IS NULL OR last_login IN ('', '-') THEN NULL ELSE last_login::TIMESTAMP WITH TIME ZONE END`.
  - Safe cast for `created_at`: `CASE WHEN created_at IS NULL OR created_at = '' THEN NOW() ELSE created_at::TIMESTAMP WITH TIME ZONE END`.

### 2.3 Agent VSS Mutex Serialization (`AG-GAP-02`)
- In `agent/internal/modules/windows_artifacts.go`:
  - Package-level mutex: `var vssMu sync.Mutex`.
  - In `vssCreate`: lock mutex during snapshot creation and ensure deferred release or serialized access.
  - Because VSS WMI provider fails when multiple processes/threads call `Create()` concurrently, serializing snapshot creation guarantees failure-free acquisition of locked artifacts (`$MFT`, `$UsnJrnl`, `SRUDB.dat`, `ntds.dit`).

### 2.4 Agent Point-of-Capture SHA-256 Manifest (`AG-GAP-06`)
- In `agent/internal/jobs/executor.go`:
  - Before archive packaging in `createEvidenceZip`, iterate through all collected evidence files in `job.WorkDir`.
  - Compute SHA-256 hash of each file via streaming `crypto/sha256`.
  - Write `manifest.sha256` in standard format: `<64-char-hex-hash>  <relpath>\n`.
  - Append `manifest.sha256` to the archive inventory so it is included inside `collection.zip`.
  - Log completion of manifest generation in job logger.

### 2.5 Agent Streaming Upload with Content-Length (`AG-GAP-07`)
- In `agent/internal/api/client.go:uploadZip`:
  - Read file stat to get `zipSize`.
  - Instead of unbuffered `io.Pipe()` with unknown length, construct a streaming multipart body using `io.MultiReader(headerBuf, file, footerBuf)`.
  - Header buffer contains `multipart.Writer` preamble (`--boundary\r\nContent-Disposition...`).
  - Footer buffer contains trailing `--boundary--\r\n`.
  - Total length = `len(headerBuf) + zipSize + len(footerBuf)`.
  - Set `req.ContentLength = totalLength`.
  - Proxies receive exact `Content-Length` header; memory remains $O(1)$ stream from disk.

### 2.6 Frontend Polish & Fixes (`FE-GAP-08`, `FE-GAP-09`, `FE-GAP-10`)
- **FE-GAP-10**: Delete unreferenced `frontend/src/components/TimelineExplorer.tsx`.
- **FE-GAP-08**: In `frontend/src/pages/Dashboard.tsx`:
  - Implement `handleBulkPurge`: confirm with user before executing, call `apiDelete(`/incidents/${id}`)` for selected incidents.
  - Handle errors gracefully (e.g. if an incident has evidence or active legal hold, display descriptive error/toast).
  - Clear selection and invalidate `["incidents"]` query.
- **FE-GAP-09**: In `frontend/src/pages/AuditLog.tsx`:
  - In `handleExport`, query `/audit-logs/?limit=10000&...` with all active filter parameters (search, event_type, actor_id, time range).
  - Stream all matching records into the downloaded CSV file with proper escaping.

### 2.7 Performance Polish: DuckDB Connection Cache & Threat Intel Redis Cache
- **DuckDB Cache**: In `backend/app/api/v1/endpoints/evidence.py`, implement a thread-safe LRU connection cache `_get_duckdb_read_conn(db_path)` for read-only DuckDB handles to eliminate connection creation overhead.
- **Threat Intel Redis Cache**: In `backend/app/api/v1/endpoints/threat_intel.py`, check Redis key `f"threat_intel:{service}:{ioc_type}:{ioc_value}"` before external calls; cache successful results for 86400s (24 hours). Fallback gracefully if Redis is unavailable.

---

## 3. Verification & Acceptance Criteria
1. Backend test suite (`pytest tests/`) passes with 100% success.
2. Go agent test suite (`go test ./...`) passes across all packages.
3. Frontend typecheck (`npm run typecheck`), lint (`npm run lint`), vitest (`npm test`), and production build (`npm run build`) pass cleanly.
4. Celery tasks route to their respective queues; user datetime migration executes without loss.
5. Evidence zip contains `manifest.sha256` matching captured artifact hashes.
6. Whole-branch review approved prior to `main` merge.
