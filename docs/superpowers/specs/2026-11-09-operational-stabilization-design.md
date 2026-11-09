# Core Operational Stabilization (Phase 0 Blockers) Design Document

**Date**: 2026-11-09  
**Author**: Antigravity Assistant & Engineering Taskforce  
**Status**: Approved for Implementation Planning  
**Target File**: `docs/superpowers/specs/2026-11-09-operational-stabilization-design.md`

---

## 1. Intent & Context

During the comprehensive technical audit of the DFIR Rapid Collection Kit, eight (8) critical runtime blockers (P0) were identified across the Go agent, backend services, database worker tasks, and frontend SPA. These blockers cause immediate operational failures: Go agents cannot enroll, collectors cannot be added from the UI, Celery background pipeline chaining crashes silently on every collection, scheduled evidence integrity checks fail with 0% coverage, Linux memory acquisition attempts to copy 128 Terabytes to endpoint disks, forensic evidence is destroyed on transient network drops while being permanently leaked on success, live console WebSocket sessions fail to connect, and timeline downloads throw runtime syntax errors.

This design document outlines the immediate stabilization effort to eliminate all eight P0 blockers and achieve a stable, reliable end-to-end collection and processing lifecycle.

---

## 2. Goals, Non-Goals & Anti-Goals

### Goals
1. **Unblock Agent Enrollment**: Enable seamless enrollment of new Windows, Linux, and macOS Go agents via `POST /api/v1/agents/register`.
2. **Unblock Collector Management**: Allow operators and admins to register new collector nodes via the frontend modal.
3. **Restore Automatic Super-Timeline Chaining**: Ensure the Celery pipeline cleanly transitions from Zimmerman tool parsing and Sigma hunting to DuckDB Super-Timeline construction.
4. **Fix Evidentiary Integrity Auditing**: Ensure periodic background integrity tasks correctly locate and verify SHA-256 hashes of all stored evidence items.
5. **Endpoint Safety & OPSEC**: Eliminate endpoint disk exhaustion risks on Linux by safely handling memory acquisition, and establish correct evidence workdir retention/cleanup behavior.
6. **Restore Live Analyst Console & Data Export**: Fix WebSocket authentication in `AgentConsole.tsx` via HttpOnly cookie transport and enable direct binary blob streaming for timeline downloads.

### Non-Goals
- Migrating the live command architecture from Python memory to Redis Pub/Sub (scheduled for Phase 1).
- Normalizing all 22 GET and 8 mutating trailing-slash differences across the entire application (scheduled for Phase 2).
- Rewriting `types/dfir.ts` from camelCase to snake_case across all 34 pages (scheduled for Phase 2).
- Refactoring `AdminSettings.tsx` monolithic component structure (scheduled for Phase 3).

### Anti-Goals
- Altering core forensic schemas, cryptographic hash chaining mathematical formulations, or database table structures.
- Breaking HttpOnly session cookie security by exposing raw JWT tokens to frontend JavaScript.
- Introducing external non-standard dependencies to the Go agent binary or FastAPI backend.

---

## 3. Approaches Considered & Trade-offs

| Approach | Description | Trade-offs | Verdict |
| :--- | :--- | :--- | :--- |
| **Approach A: Core Operational Stabilization (Selected)** | Target the 8 critical runtime blockers across Backend schemas, Worker tasks, Agent memory/workdir, and Frontend WebSocket/download. | Does not address lower-priority UX polish or cosmetic slash redirects, but eliminates 100% of runtime crashers immediately. | **Selected (User Confirmed)** |
| **Approach B: Full Lifecycle Hardening & Normalization** | Address Phase 0 blockers plus Phase 1/2 architectural work (Redis Pub/Sub, trailing slash normalization, full type refactor). | Much larger scope; delays deployment of critical bug fixes for agent enrollment and memory acquisition. | Deferred to subsequent phases |

---

## 4. Detailed Component Specifications & Builder Decisions

### 4.1 Defect 1: Agent Registration Schema (`backend/app/schemas/device.py`)
* **Problem**: `DeviceBase` defines `last_seen`, `collection_status`, and `registered_at` as required fields without defaults. When `Client.Register()` calls `POST /api/v1/agents/register`, FastAPI rejects the payload with HTTP 422.
* **Specification**: Update `DeviceCreate` in `backend/app/schemas/device.py`:
  ```python
  class DeviceCreate(BaseModel):
      id: str
      hostname: str
      ip_address: str
      type: str = "workstation"
      os: str = "unknown"
      agent_version: str = "1.0.0"
      status: str = "ONLINE"
      last_seen: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
      collection_status: str = "IDLE"
      registered_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
      cpu_usage: int | None = None
      memory_usage: int | None = None
  ```

### 4.2 Defect 2: Collector Registration Schema (`backend/app/schemas/collector.py`)
* **Problem**: `CollectorCreate` requires `id`, `status`, and `last_heartbeat` without defaults. The frontend form in `Collectors.tsx` sends `{ name, endpoint }`, failing with HTTP 422.
* **Specification**: Update `CollectorCreate` in `backend/app/schemas/collector.py`:
  ```python
  class CollectorCreate(BaseModel):
      id: str = Field(default_factory=lambda: f"COL-{uuid4().hex[:8].upper()}")
      name: str
      endpoint: str
      status: str = "ONLINE"
      last_heartbeat: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
  ```

### 4.3 Defect 3: Forensics Pipeline Chaining Crash (`backend/app/services/artifact_parser_service.py`)
* **Problem**:
  1. Line 453 imports `from app.crud.system_settings import get_runtime_settings`, which does not exist (module is `app.services.system_settings_service`).
  2. Line 465 passes `base_path` (`{storage}/{incident_id}/{job_id}`) to `dispatch_super_timeline`. `super_timeline_service.py:370` expects `evidence_base_path` to be root `{storage}`.
* **Specification**:
  1. Update import: `from app.services.system_settings_service import get_runtime_settings`.
  2. Pass `Path(runtime.evidence_storage_path)` instead of `base_path` to `dispatch_super_timeline(incident_id, Path(runtime.evidence_storage_path))`.

### 4.4 Defect 4: Evidence Integrity Task File Resolution (`backend/app/worker.py`)
* **Problem**: Line 580 calculates `file_path = evidence_base / item.incident_id / item.name`. Files are physically stored at `item.relative_path` (`{job_id}/extracted/...`). As a result, `file_path.exists()` is always `False`, skipping all items.
* **Specification**:
  ```python
  rel_path = item.relative_path or (f"{item.job_id}/extracted/{item.name}" if item.job_id else item.name)
  file_path = safe_join(evidence_base / item.incident_id, rel_path)
  ```
  Import and use `safe_join` from `app.core.evidence_files` to guarantee path traversal protection.

### 4.5 Defect 5: Linux Memory Acquisition Safety (`agent/internal/modules/linux_memory.go`)
* **Builder Call**:
  - Sequential reading of `/proc/kcore` from offset 0 does not yield a forensically parseable memory image (physical memory pages reside in architecture-specific high-memory virtual segments at `PAGE_OFFSET`).
  - Attempting unconstrained sequential reads will crash endpoints with 128TB disk exhaustion.
* **Specification**:
  1. When Microsoft AVML (`avml`) is found in PATH or standard bin directories, execute AVML.
  2. When LiME (`/proc/lime` or module) is present, acquire via LiME.
  3. If neither AVML nor LiME is present, do **not** run an unconstrained sequential read on `/proc/kcore`. Instead, return a structured warning error:
     ```go
     return fmt.Errorf("linux_memory_acquisition: AVML or LiME driver required for physical memory acquisition; /proc/kcore sequential read skipped to prevent host crash")
     ```
  4. In `executor.go`, treat this error gracefully as a module warning so non-memory modules proceed uninterrupted while alerting the analyst in the collection log.

### 4.6 Defect 6: Endpoint Evidence Workdir Lifecycle (`agent/internal/jobs/executor.go`)
* **Builder Call**:
  - **Pre-Zip Failure**: If a collection job fails or aborts *before* `collection.zip` is assembled, immediately call `storage.Cleanup(workDir)` to eliminate all uncompressed staging artifacts from the endpoint.
  - **Upload Retry**: Wrap `apiClient.UploadEvidence` in an exponential backoff retry loop (3 attempts: 2s, 4s, 8s).
  - **Upload Success**: Immediately after confirmed upload success, call `_ = storage.Cleanup(workDir)` and log cleanup.
  - **Persistent Upload Failure**: If all 3 upload attempts fail, delete the uncompressed staging subdirectories (e.g. `workDir/extracted` or staging folders), but **retain `collection.zip`** in `workDir`. Log an explicit path to `collection.zip` for manual collection, preventing both endpoint disk exhaustion (raw files deleted) and evidence loss (zip preserved).

### 4.7 Defect 7: Live Console WebSocket Handshake (`frontend/src/pages/AgentConsole.tsx`, `backend/app/api/v1/endpoints/agent_commands.py`)
* **Builder Call**:
  - Preserve `HttpOnly` cookie security: do **not** expose raw JWTs to frontend JavaScript.
  - Browser WebSocket handshakes transmit cookies automatically when connecting to same-origin or reverse-proxied routes.
* **Specification**:
  1. In `backend/app/api/v1/endpoints/agent_commands.py:127`:
     Update parameter: `token: str | None = Query(default=None)`.
     If `token` is `None`, read `request.cookies.get(settings.AUTH_COOKIE_NAME)`.
  2. In `frontend/src/pages/AgentConsole.tsx`:
     Derive WebSocket URL dynamically:
     ```typescript
     const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
     const wsHost = import.meta.env.VITE_API_BASE_URL 
       ? import.meta.env.VITE_API_BASE_URL.replace(/^https?:\/\//, "")
       : window.location.host;
     const wsUrl = `${wsProtocol}//${wsHost}/api/v1/agent-commands/ws/${agentId}`;
     ```
     Do not pass token query parameter from browser JS; the browser delivers `dfir_session` cookie automatically. CLI clients can still pass `?token=`.

### 4.8 Defect 8: Processing Status Timeline Download (`frontend/src/pages/ProcessingStatus.tsx`)
* **Specification**: Replace `apiGet<Blob>` with direct `fetch`:
  ```typescript
  const baseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() || "/api/v1";
  const response = await fetch(`${baseUrl}/processing/${encodeURIComponent(job.job_id)}/timeline/download`, {
    credentials: "include",
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `timeline-${job.job_id}.jsonl`;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
  ```

---

## 5. Verification & Testing Matrix

| Component | Test Method | Expected Result |
| :--- | :--- | :--- |
| **Agent Enrollment** | `pytest backend/tests/test_agents.py` & mock registration payload | Returns HTTP 200 with `AgentRegistrationOut` |
| **Collector Creation** | `POST /api/v1/collectors/` with `{ name, endpoint }` | Returns HTTP 201 with generated ID & status `ONLINE` |
| **Pipeline Auto-Chaining** | Complete evidence job upload & check Celery task | `dfir.run_super_timeline` dispatched successfully without import error |
| **Evidence Integrity Task** | Run `verify_evidence_integrity_task()` with sample folder | Locates files under `relative_path` and verifies SHA-256 matches |
| **Linux Memory Safety** | Unit test `linux_memory.go` without AVML | Fails safely with warning; does not attempt 128TB read |
| **Agent Workdir Cleanup** | Test `executor.go` on mock success and mock failure | Staging cleaned up on success; zip preserved on upload failure |
| **Agent Console WebSocket** | Connect to `/ws/{agent_id}` with session cookie | Upgrades connection to 101 Switching Protocols without query token |
| **Timeline Download** | Click "Download Timeline" in `ProcessingStatus.tsx` | Streams NDJSON file as Blob download without JSON parsing errors |
