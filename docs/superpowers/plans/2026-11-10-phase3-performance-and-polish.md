# Implementation Plan: Phase 3 Performance, Reliability & Enterprise Polish

- **Branch**: `feat/phase3-performance-and-polish`
- **Spec**: `docs/superpowers/specs/2026-11-10-phase3-performance-and-polish-design.md`
- **Approach**: Subagent-Driven Development (SDD) — fresh implementer subagent per task, task diff package, independent reviewer subagent, ledger update, whole-branch review gate.

---

### Task 1: Backend Celery Queue Segregation & Worker Routing (`BE-GAP-08`)
- **Files**:
  - `backend/app/worker.py`
  - `docker-compose.yml`
  - `backend/tests/test_celery_queue_routing.py`
- **Implementation**:
  - Define queues `default`, `forensics`, `periodic` via `kombu.Queue` in `celery_app.conf.task_queues`.
  - Set `task_default_queue = "default"`.
  - Configure `task_routes`:
    - `dfir.run_pipeline`: `{"queue": "forensics"}`
    - `dfir.process_s3_upload`: `{"queue": "forensics"}`
    - `dfir.run_super_timeline`: `{"queue": "forensics"}`
    - `dfir.run_scheduled_collection`: `{"queue": "forensics"}`
    - `dfir.check_scheduled_collections`: `{"queue": "periodic"}`
    - `dfir.expire_legal_holds`: `{"queue": "periodic"}`
    - `dfir.verify_evidence_integrity`: `{"queue": "periodic"}`
  - Update `docker-compose.yml` celery worker command to consume from `-Q default,forensics,periodic`.
  - Add tests validating queue definitions, task routes, and task execution parameters.
- **Verification**: `pytest tests/test_celery_queue_routing.py` passes.

---

### Task 2: User Model Timestamp Migration & Alembic Script (`BE-GAP-09`)
- **Files**:
  - `backend/app/models/user.py`
  - `backend/app/schemas/user.py`
  - `backend/app/crud/user.py`
  - `backend/alembic/versions/20260915_user_datetime_migration.py`
  - `backend/tests/test_user_datetime_migration.py`
- **Implementation**:
  - Update `User.last_login` to `Mapped[datetime | None]` and `User.created_at` to `Mapped[datetime]` in `models/user.py`.
  - Update `schemas/user.py` to allow `datetime | str | None` with ISO serialization.
  - Update `crud/user.py` to set `last_login=None` on creation and assign `datetime.now(timezone.utc)` on login update.
  - Create Alembic revision `20260915_user_datetime_migration.py` with down-revision `20260914_case_investigation` converting `users.last_login` and `users.created_at` to `TIMESTAMP WITH TIME ZONE`.
  - Add unit tests verifying model attributes, datetime parsing, user creation, and schema conversion.
- **Verification**: `pytest tests/test_user_datetime_migration.py` passes.

---

### Task 3: Agent VSS Serialization & Endpoint SHA-256 Manifest (`AG-GAP-02`, `AG-GAP-06`)
- **Files**:
  - `agent/internal/modules/windows_artifacts.go`
  - `agent/internal/jobs/executor.go`
  - `agent/internal/jobs/executor_test.go`
- **Implementation**:
  - Add `vssMu sync.Mutex` in `windows_artifacts.go` protecting `vssCreate` to prevent concurrent snapshot collisions.
  - In `executor.go:createEvidenceZip`:
    - Before creating the ZIP, calculate SHA-256 hashes of all inventory files.
    - Write `manifest.sha256` to `job.WorkDir` formatted as `<sha256>  <relpath>\n`.
    - Include `manifest.sha256` in `inventory` and archive into `collection.zip`.
  - Add test in `executor_test.go` verifying that `manifest.sha256` is generated with correct SHA-256 entries.
- **Verification**: `go test -v ./agent/internal/jobs/...` and `go test ./agent/internal/modules/...` pass.

---

### Task 4: Agent Upload Content-Length Header & Streaming Multiparter (`AG-GAP-07`)
- **Files**:
  - `agent/internal/api/client.go`
  - `agent/internal/api/client_test.go`
- **Implementation**:
  - In `client.go:uploadZip`:
    - Calculate multipart form overhead using `io.MultiReader(headerBuf, file, footerBuf)`.
    - Set `req.ContentLength = int64(headerBuf.Len()) + stat.Size() + int64(footerBuf.Len())`.
    - Set `req.Header.Set("Content-Length", strconv.FormatInt(req.ContentLength, 10))`.
    - Stream directly from file without buffering whole archive into RAM.
  - Add unit test verifying that `uploadZip` sets a non-zero, positive `Content-Length` header on the request.
- **Verification**: `go test -v ./agent/internal/api/...` passes.

---

### Task 5: Frontend Enterprise Cleanup & Audit Log Full Export (`FE-GAP-08`, `FE-GAP-09`, `FE-GAP-10`)
- **Files**:
  - Delete `frontend/src/components/TimelineExplorer.tsx`
  - `frontend/src/pages/Dashboard.tsx`
  - `frontend/src/pages/AuditLog.tsx`
  - `frontend/src/pages/AuditLog.test.tsx`
- **Implementation**:
  - Remove `frontend/src/components/TimelineExplorer.tsx`.
  - In `Dashboard.tsx`:
    - Add `handleBulkPurge` with user confirmation dialog (`window.confirm`).
    - Iterate through `selectedIds` calling `apiDelete(`/incidents/${id}`)` with catch handlers.
    - Invalidate `["incidents"]` query on completion and clear selection.
  - In `AuditLog.tsx`:
    - Update `handleExport` to fetch up to 10,000 matching audit entries via `apiGet('/audit-logs/', { limit: 10000, ...filters })`.
    - Render and trigger download of the full CSV.
  - Add tests in `AuditLog.test.tsx` verifying full CSV export behavior.
- **Verification**: `npm run typecheck`, `npm test`, `npm run build` pass.

---

### Task 6: DuckDB Read-Only Connection Cache & Threat Intel 24-hr Redis Cache
- **Files**:
  - `backend/app/api/v1/endpoints/evidence.py`
  - `backend/app/api/v1/endpoints/threat_intel.py`
  - `backend/tests/test_threat_intel_cache.py`
  - `backend/tests/test_duckdb_cache.py`
- **Implementation**:
  - In `evidence.py`: Implement thread-safe connection caching for read-only DuckDB connections (`_get_duckdb_read_conn(path)`) using a dictionary protected by `threading.Lock`.
  - In `threat_intel.py`: Add Redis caching layer (`_get_cached_enrichment`, `_set_cached_enrichment`) using `REDIS_URL` or in-memory dictionary fallback with 24-hour expiration (86400 seconds).
  - Add unit tests verifying cache hits, expirations, and connection reuse.
- **Verification**: `pytest tests/test_threat_intel_cache.py tests/test_duckdb_cache.py` pass.

---

### Task 7: Phase 3 Full Regression Verification & Whole-Branch Review
- **Execution**:
  - Run full backend pytest suite (`pytest tests/`).
  - Run full Go agent test suite (`go test -count=1 ./...`).
  - Run frontend typecheck, linter, tests, and build.
  - Generate whole-branch diff (`git diff main..HEAD`).
  - Dispatch Final Whole-Branch Code Reviewer subagent.
  - On approval, fast-forward merge `feat/phase3-performance-and-polish` into `main`.
