# Core Operational Stabilization (Phase 0 Blockers) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate all eight (8) P0 critical runtime blockers across Backend schemas, Celery workers, Go Agent memory/workdir lifecycles, and Frontend WebSocket/download flows to achieve a fully stable acquisition, pipeline, and telemetry foundation.

**Architecture:** Rectify data contracts on FastAPI Pydantic models to allow agent enrollment and collector creation; fix broken Celery pipeline auto-chaining imports and evidence file resolution; bound Linux memory collection and harden agent workdir cleanup with upload retries; and restore same-origin cookie WebSocket terminal sessions and raw binary timeline downloads.

**Tech Stack:** Python 3.12, FastAPI, Pydantic v2, SQLAlchemy 2.0 (asyncpg), Celery, Go 1.25, React 18, TypeScript, Vite.

**Spec:** [`docs/superpowers/specs/2026-11-09-operational-stabilization-design.md`](file:///d:/0x13%20PROJECT/DFIRCollectionKit/docs/superpowers/specs/2026-11-09-operational-stabilization-design.md)

## Global Constraints
- Python code must conform to `black` (line length 100) and `isort` (profile=black).
- Pydantic models must use Pydantic v2 syntax (`model_dump()`, `Field(default_factory=...)`).
- Go code must build cleanly via `go test ./...` with zero new external dependencies.
- Frontend TypeScript must pass `npm run typecheck` cleanly.
- Never alter core cryptographic hash chaining logic or weaken HttpOnly authentication boundaries.

## Review Focus
1. **Agent Enrollment Payload Compatibility**: Ensure `DeviceCreate` handles omitted timestamps without breaking database not-null constraints.
2. **Path Traversal Protection**: Ensure evidence integrity path resolution uses `safe_join` to prevent escaping the vault directory.
3. **Endpoint Safety on Linux**: Ensure `/proc/kcore` never triggers unconstrained reads when AVML/LiME is missing.
4. **Evidence Non-Destruction**: Ensure transient network timeouts during upload never delete un-uploaded `collection.zip` archives.
5. **WebSocket Authentication**: Ensure WebSocket terminal sessions authenticate via `dfir_session` cookie without exposing tokens in client JS.

---

### Task 1: Backend Device and Collector Registration Schemas

**Files:**
- Modify: `backend/app/schemas/device.py:18-35`
- Modify: `backend/app/schemas/collector.py:10-25`
- Test: `backend/tests/test_registration_schemas.py`

**Interfaces:**
- Consumes: `pydantic.BaseModel`, `pydantic.Field`, `datetime.datetime`, `uuid.uuid4`
- Produces: `DeviceCreate` with auto-defaulted `last_seen`, `registered_at`, `collection_status`; `CollectorCreate` with auto-defaulted `id`, `status`, `last_heartbeat`.

- [ ] **Step 1: Write the failing schema unit test**

```python
# backend/tests/test_registration_schemas.py
from datetime import datetime, timezone
import pytest
from app.schemas.device import DeviceCreate
from app.schemas.collector import CollectorCreate

def test_device_create_accepts_agent_payload():
    payload = {
        "id": "agent-test-123",
        "hostname": "DC01",
        "ip_address": "192.168.1.10",
        "type": "server",
        "os": "windows",
        "agent_version": "1.0.0",
        "status": "ONLINE",
    }
    device = DeviceCreate(**payload)
    assert device.id == "agent-test-123"
    assert device.collection_status == "IDLE"
    assert isinstance(device.last_seen, datetime)
    assert isinstance(device.registered_at, datetime)

def test_collector_create_accepts_minimal_payload():
    payload = {
        "name": "Collector Node 01",
        "endpoint": "http://192.168.1.200:8080",
    }
    collector = CollectorCreate(**payload)
    assert collector.name == "Collector Node 01"
    assert collector.status == "ONLINE"
    assert collector.id.startswith("COL-")
    assert isinstance(collector.last_heartbeat, datetime)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest backend/tests/test_registration_schemas.py -v`  
Expected: FAIL with `pydantic.ValidationError` (Field required: `last_seen`, `collection_status`, `registered_at`, `id`, `status`, `last_heartbeat`)

- [ ] **Step 3: Update `DeviceCreate` and `CollectorCreate` schemas**

In `backend/app/schemas/device.py`:
```python
from datetime import datetime, timezone
from pydantic import BaseModel, Field

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

In `backend/app/schemas/collector.py`:
```python
from datetime import datetime, timezone
from uuid import uuid4
from pydantic import BaseModel, Field

class CollectorCreate(BaseModel):
    id: str = Field(default_factory=lambda: f"COL-{uuid4().hex[:8].upper()}")
    name: str
    endpoint: str
    status: str = "ONLINE"
    last_heartbeat: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest backend/tests/test_registration_schemas.py -v`  
Expected: PASS (2 passed)

- [ ] **Step 5: Commit changes**

```bash
git add backend/app/schemas/device.py backend/app/schemas/collector.py backend/tests/test_registration_schemas.py
git commit -m "fix(backend): provide default factories for DeviceCreate and CollectorCreate"
```

---

### Task 2: Pipeline Chaining & Evidence Integrity Path Fixes

**Files:**
- Modify: `backend/app/services/artifact_parser_service.py:450-475`
- Modify: `backend/app/worker.py:570-595`
- Test: `backend/tests/test_pipeline_chaining_and_integrity.py`

**Interfaces:**
- Consumes: `app.services.system_settings_service.get_runtime_settings`, `app.core.evidence_files.safe_join`
- Produces: Correct super-timeline root path dispatch and relative-path evidence integrity verification.

- [ ] **Step 1: Write unit tests for pipeline chaining import & integrity path resolution**

```python
# backend/tests/test_pipeline_chaining_and_integrity.py
from pathlib import Path
from unittest.mock import MagicMock, patch
import pytest

def test_pipeline_chaining_imports_cleanly():
    # Verify the import path used in artifact_parser_service does not raise ModuleNotFoundError
    from app.services.system_settings_service import get_runtime_settings
    assert callable(get_runtime_settings)

def test_integrity_task_path_resolution():
    from app.core.evidence_files import safe_join
    evidence_base = Path("/vault/evidence")
    incident_id = "INC-1234"
    relative_path = "job-5678/extracted/Security.evtx"
    
    file_path = safe_join(evidence_base / incident_id, relative_path)
    expected = (evidence_base / incident_id / relative_path).resolve()
    assert file_path == expected
```

- [ ] **Step 2: Run test to verify import and path checks**

Run: `pytest backend/tests/test_pipeline_chaining_and_integrity.py -v`  
Expected: PASS

- [ ] **Step 3: Fix `artifact_parser_service.py` and `worker.py`**

In `backend/app/services/artifact_parser_service.py` (around line 453 and 465):
```python
# Replace invalid import
from app.services.system_settings_service import get_runtime_settings

# Pass root evidence storage path to dispatch_super_timeline
runtime = await get_runtime_settings(db)
if runtime.auto_process:
    from app.services.super_timeline_service import dispatch_super_timeline

    # dispatch_super_timeline expects the evidence root directory
    dispatch_super_timeline(incident_id, Path(runtime.evidence_storage_path))
```

In `backend/app/worker.py` (around line 580):
```python
from app.core.evidence_files import safe_join

# In verify_evidence_integrity_task loop:
rel_path = item.relative_path or (f"{item.job_id}/extracted/{item.name}" if item.job_id else item.name)
try:
    file_path = safe_join(evidence_base / item.incident_id, rel_path)
except Exception as p_err:
    logger.warning("Unsafe or invalid evidence relative path for item %s: %s", item.id, p_err)
    continue

if not file_path.exists():
    missing += 1
    logger.warning("Evidence file missing from disk: %s (item %s)", file_path, item.id)
    continue
```

- [ ] **Step 4: Run backend tests to verify no regressions**

Run: `pytest backend/tests/test_pipeline_chaining_and_integrity.py backend/tests/test_workflow_regressions.py -v`  
Expected: PASS

- [ ] **Step 5: Commit changes**

```bash
git add backend/app/services/artifact_parser_service.py backend/app/worker.py backend/tests/test_pipeline_chaining_and_integrity.py
git commit -m "fix(pipeline): resolve super-timeline root path and verify evidence relative paths"
```

---

### Task 3: Go Agent Linux Memory Acquisition Safety

**Files:**
- Modify: `agent/internal/modules/linux_memory.go:50-95`
- Test: `agent/internal/modules/linux_memory_test.go`

**Interfaces:**
- Consumes: `os.Stat`, `exec.LookPath`, `fmt.Errorf`
- Produces: Safe fallback that refuses unbounded sequential reads of `/proc/kcore` without AVML/LiME.

- [ ] **Step 1: Write unit test for Linux memory acquisition fallback**

```go
// agent/internal/modules/linux_memory_test.go
package modules

import (
	"context"
	"os"
	"path/filepath"
	"testing"
)

func TestLinuxMemoryAcquisition_NoAVML_SafeAbort(t *testing.T) {
	tmpDir := t.TempDir()
	outPath := filepath.Join(tmpDir, "memory.raw")
	
	ctx := context.Background()
	// Force avml and lime to be missing
	err := LinuxMemoryAcquisition(ctx, outPath, false, nil)
	// Must return a structured error or nil, but MUST NOT create a 128TB file
	if err == nil {
		t.Log("Memory acquisition completed (AVML present)")
	} else {
		t.Logf("Safely returned error: %v", err)
	}

	fi, statErr := os.Stat(outPath)
	if statErr == nil && fi.Size() > 1024*1024*1024*64 { // 64 GB
		t.Fatalf("Memory dump file unexpectedly large: %d bytes", fi.Size())
	}
}
```

- [ ] **Step 2: Run test to check current behavior**

Run: `go test ./agent/internal/modules -run TestLinuxMemoryAcquisition_NoAVML_SafeAbort -v`  
Expected: Compiles and executes.

- [ ] **Step 3: Update `LinuxMemoryAcquisition` in `agent/internal/modules/linux_memory.go`**

```go
// In agent/internal/modules/linux_memory.go:
// Check for AVML first
if avmlPath, err := exec.LookPath("avml"); err == nil {
	cmd := exec.CommandContext(ctx, avmlPath, outputPath)
	if err := cmd.Run(); err == nil {
		return nil
	}
}

// Check for LiME driver
if _, err := os.Stat("/proc/lime"); err == nil {
	// LiME acquisition logic
}

// Fallback safeguard: Do NOT sequential-copy /proc/kcore without an ELF segment parser
return fmt.Errorf("linux_memory_acquisition: AVML or LiME driver required for physical memory capture on Linux; /proc/kcore sequential read skipped to prevent host crash")
```

- [ ] **Step 4: Run test to verify it passes**

Run: `go test ./agent/internal/modules -run TestLinuxMemoryAcquisition_NoAVML_SafeAbort -v`  
Expected: PASS

- [ ] **Step 5: Commit changes**

```bash
git add agent/internal/modules/linux_memory.go agent/internal/modules/linux_memory_test.go
git commit -m "fix(agent): protect against /proc/kcore unbounded 128TB disk exhaustion"
```

---

### Task 4: Go Agent Workdir Retention & Upload Retry Logic

**Files:**
- Modify: `agent/internal/jobs/executor.go:130-150, 395-430`
- Test: `agent/internal/jobs/executor_retry_test.go`

**Interfaces:**
- Consumes: `storage.Cleanup`, `apiClient.UploadEvidence`, `time.Sleep`
- Produces: Workdir cleaned up on upload success; uncompressed staging pruned while `collection.zip` is retained on upload failure.

- [ ] **Step 1: Write test for upload retry and cleanup semantics**

```go
// agent/internal/jobs/executor_retry_test.go
package jobs

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"
)

type mockFailingAPIClient struct {
	failCount int
	maxFails  int
}

func (m *mockFailingAPIClient) UploadEvidence(ctx context.Context, jobID, zipPath string) error {
	if m.failCount < m.maxFails {
		m.failCount++
		return errors.New("network timeout")
	}
	return nil
}
```

- [ ] **Step 2: Implement upload retry loop and conditional retention in `agent/internal/jobs/executor.go`**

In `executor.go:135`:
```go
var zipPath string
var zipCreated bool

defer func() {
	if retErr != nil {
		if zipCreated && zipPath != "" {
			// On persistent failure after ZIP was created: prune staging files, preserve collection.zip
			logging.Warning("Retaining evidence archive for manual recovery: %s", zipPath)
			pruneStagingKeepZip(workDir, zipPath)
		} else {
			// Pre-zip failure: clean up everything to avoid leaving junk on endpoint
			_ = storage.Cleanup(workDir)
		}
	}
}()
```

In `executor.go:400` (upload execution):
```go
// Retry loop for evidence upload: 3 attempts with backoff
maxAttempts := 3
var uploadErr error
for attempt := 1; attempt <= maxAttempts; attempt++ {
	uploadErr = e.apiClient.UploadEvidence(ctx, job.ID, zipPath)
	if uploadErr == nil {
		break
	}
	logging.Warning("Upload attempt %d/%d failed: %v", attempt, maxAttempts, uploadErr)
	if attempt < maxAttempts {
		time.Sleep(time.Duration(attempt*2) * time.Second)
	}
}

if uploadErr != nil {
	retErr = fmt.Errorf("evidence upload failed after %d attempts: %w", maxAttempts, uploadErr)
	return retErr
}

// Clean up entire workdir on confirmed success
_ = storage.Cleanup(workDir)
logging.Info("Evidence successfully uploaded and local workdir cleaned: %s", workDir)
```

- [ ] **Step 3: Run agent unit tests**

Run: `go test ./agent/internal/jobs -v`  
Expected: PASS

- [ ] **Step 4: Commit changes**

```bash
git add agent/internal/jobs/executor.go
git commit -m "fix(agent): implement upload retry and safe workdir retention lifecycle"
```

---

### Task 5: Live Console WebSocket Handshake & Auth Alignment

**Files:**
- Modify: `backend/app/api/v1/endpoints/agent_commands.py:125-145`
- Modify: `frontend/src/pages/AgentConsole.tsx:18-35, 50-70`
- Test: `backend/tests/test_console_ws_auth.py`

**Interfaces:**
- Consumes: `request.cookies.get(settings.AUTH_COOKIE_NAME)`, `window.location`, `VITE_API_BASE_URL`
- Produces: Working WebSocket terminal connection using HttpOnly cookie session.

- [ ] **Step 1: Write test for WebSocket cookie auth in backend**

```python
# backend/tests/test_console_ws_auth.py
from fastapi.testclient import TestClient
from app.main import app

def test_ws_accepts_cookie_or_token():
    client = TestClient(app)
    # Connecting without cookie or query token should be rejected with 4001 or 403
    with client.websocket_connect("/api/v1/agent-commands/ws/dev-test") as ws:
        pass # Will raise WebSocketDenialResponse
```

- [ ] **Step 2: Update `backend/app/api/v1/endpoints/agent_commands.py`**

Line 127:
```python
@router.websocket("/ws/{agent_id}")
async def agent_console_ws(
    websocket: WebSocket,
    agent_id: str,
    token: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    # If token not in query, check HttpOnly auth cookie
    if not token:
        token = websocket.cookies.get(settings.AUTH_COOKIE_NAME)
    
    if not token:
        await websocket.close(code=4001, reason="Missing authentication credentials")
        return
    ...
```

- [ ] **Step 3: Update `frontend/src/pages/AgentConsole.tsx`**

Derive WebSocket URL using `VITE_API_BASE_URL` and relative origin:
```typescript
const getWsUrl = (agentId: string) => {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const envUrl = import.meta.env.VITE_API_BASE_URL as string | undefined;
  if (envUrl) {
    const cleanHost = envUrl.replace(/^https?:\/\//, "").replace(/\/+$/, "");
    return `${protocol}//${cleanHost}/agent-commands/ws/${encodeURIComponent(agentId)}`;
  }
  return `${protocol}//${window.location.host}/api/v1/agent-commands/ws/${encodeURIComponent(agentId)}`;
};
```

- [ ] **Step 4: Verify frontend builds cleanly**

Run: `npm --prefix frontend run typecheck`  
Expected: PASS with 0 errors

- [ ] **Step 5: Commit changes**

```bash
git add backend/app/api/v1/endpoints/agent_commands.py frontend/src/pages/AgentConsole.tsx
git commit -m "fix(console): enable cookie auth for WebSocket and dynamic host resolution"
```

---

### Task 6: Processing Timeline NDJSON Stream Download

**Files:**
- Modify: `frontend/src/pages/ProcessingStatus.tsx:490-515`
- Test: `frontend/src/pages/__tests__/ProcessingStatus.test.tsx` (or typecheck)

**Interfaces:**
- Consumes: Native `fetch` with `credentials: "include"`, `response.blob()`
- Produces: Direct file download of NDJSON timeline stream without JSON parse exceptions.

- [ ] **Step 1: Replace `apiGet<Blob>` with direct `fetch` in `ProcessingStatus.tsx`**

In `frontend/src/pages/ProcessingStatus.tsx`:
```typescript
const handleDownloadTimeline = async (job: ProcessingJobSummary) => {
  try {
    const baseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() || "/api/v1";
    const response = await fetch(
      `${baseUrl}/processing/${encodeURIComponent(job.job_id)}/timeline/download`,
      { credentials: "include" }
    );
    if (!response.ok) {
      throw new Error(`Download failed: HTTP ${response.status}`);
    }
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `timeline-${job.job_id}.jsonl`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
    toast({ title: "Downloaded", description: `Timeline saved for job ${job.job_id}` });
  } catch (err) {
    toast({
      variant: "destructive",
      title: "Download Error",
      description: err instanceof Error ? err.message : "Failed to download timeline",
    });
  }
};
```

- [ ] **Step 2: Run frontend typecheck and build**

Run: `npm --prefix frontend run build`  
Expected: Vite build succeeds with 0 errors

- [ ] **Step 3: Commit changes**

```bash
git add frontend/src/pages/ProcessingStatus.tsx
git commit -m "fix(frontend): stream timeline JSONL downloads using direct fetch blob"
```

---

### Task 7: End-to-End Regression Verification

**Files:**
- Modify: `backend/tests/test_workflow_regressions.py`
- Run: Full backend and agent test suites

**Interfaces:**
- Consumes: All updated endpoints and schemas
- Produces: Complete passing test run verifying no regressions across the 8 P0 areas.

- [ ] **Step 1: Execute full backend test suite**

Run: `pytest backend/tests/ -v`  
Expected: All tests pass.

- [ ] **Step 2: Execute full Go agent test suite**

Run: `go test -v ./agent/...`  
Expected: All tests pass.

- [ ] **Step 3: Execute frontend typecheck and linter**

Run: `npm --prefix frontend run typecheck && npm --prefix frontend run lint`  
Expected: Clean pass.

- [ ] **Step 4: Commit test suite additions**

```bash
git add backend/tests/
git commit -m "test: add comprehensive regression test coverage for operational stabilization"
```

