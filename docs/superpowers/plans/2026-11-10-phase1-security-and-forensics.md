# Phase 1: Security & Forensic Integrity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Phase 1 security hardening and forensic integrity enhancements: preserve audit log hash chains across retention pruning, migrate live agent commands to Redis Pub/Sub, eliminate PowerShell admin privilege checks via native Win32 token queries, capture multi-user Windows/macOS artifacts, include registry `.LOG1`/`.LOG2` transaction logs, and secure export signature comparisons.

**Architecture:** Distributed Redis messaging bus with resilient memory fallback; native Windows security SID token inspection; multi-SID/multi-user artifact harvesting; cryptographically chained archival genesis checkpoints; constant-time digest verification.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy 2.0 (asyncpg), Redis, Go 1.25 (`golang.org/x/sys/windows`).

**Spec:** [`docs/superpowers/specs/2026-11-10-phase1-security-and-forensics-design.md`](file:///d:/0x13%20PROJECT/DFIRCollectionKit/docs/superpowers/specs/2026-11-10-phase1-security-and-forensics-design.md)

---

## Global Constraints
- Python code must conform to `black` (line length 100) and `isort` (profile=black).
- Zero new external Go dependencies (use existing standard library and `golang.org/x/sys/windows`).
- All tests must pass cleanly (`pytest` on backend, `go test` on agent).
- Maintain backward compatibility for standalone deployments where Redis is unavailable.

---

### Task 1: Audit Log Hash Chain Verification & Checkpoint Pruning

**Files:**
- Modify: `backend/app/api/v1/endpoints/audit_logs.py`
- Modify: `backend/app/crud/audit_log.py`
- Modify: `backend/app/services/audit_log_service.py`
- Test: `backend/tests/test_audit_chain_integrity.py`

**Interfaces:**
- Consumes: `AuditLog`, `_hash_payload`, `AsyncSession`
- Produces: `verify_audit_log_chain`, `GET /api/v1/audit-logs/verify`, and checkpoint-preserving `prune_old_entries`.

- [ ] **Step 1: Write unit tests for chain verification and checkpoint pruning**

```python
# backend/tests/test_audit_chain_integrity.py
import pytest
from datetime import datetime, timedelta, timezone
from app.services.audit_log_service import record_event, verify_audit_log_chain
from app.crud.audit_log import prune_old_entries, list_entries
from app.models.audit_log import AuditLog

@pytest.mark.asyncio
async def test_audit_log_chain_verification(db_session):
    # Verify an intact chain passes verification
    entries = await list_entries(db_session, limit=100)
    is_valid, error = verify_audit_log_chain(entries)
    assert is_valid is True
    assert error is None
```

- [ ] **Step 2: Implement `verify_audit_log_chain` and GET endpoint**
- [ ] **Step 3: Remove auto-pruning on GET in `audit_logs.py` and implement archival checkpoint in `prune_old_entries`**
- [ ] **Step 4: Run tests and commit**
```bash
git add backend/app/api/v1/endpoints/audit_logs.py backend/app/crud/audit_log.py backend/app/services/audit_log_service.py backend/tests/test_audit_chain_integrity.py
git commit -m "fix(audit): preserve hash chain with archival checkpoints and add chain verification"
```

---

### Task 2: Distributed Redis Bus & In-Memory Resilient Fallback for Agent Commands

**Files:**
- Create: `backend/app/core/redis_bus.py`
- Modify: `backend/app/api/v1/endpoints/agent_commands.py`
- Test: `backend/tests/test_agent_commands_redis_bus.py`

**Interfaces:**
- Consumes: `settings.REDIS_URL`, `redis.asyncio`
- Produces: Multi-worker command queue (`enqueue_agent_command`, `pop_agent_command`) and terminal pub/sub streaming (`publish_command_output`, `subscribe_command_output`).

- [ ] **Step 1: Write unit test for command bus (both redis and local fallback)**
- [ ] **Step 2: Create `app/core/redis_bus.py`**
- [ ] **Step 3: Update `agent_commands.py` to route through command bus**
- [ ] **Step 4: Run tests and commit**
```bash
git add backend/app/core/redis_bus.py backend/app/api/v1/endpoints/agent_commands.py backend/tests/test_agent_commands_redis_bus.py
git commit -m "feat(commands): implement distributed Redis command queue and live output pubsub with fallback"
```

---

### Task 3: Native Win32 Admin Privilege Verification

**Files:**
- Modify: `agent/internal/modules/privilege.go`
- Create: `agent/internal/modules/privilege_windows.go`
- Create: `agent/internal/modules/privilege_other.go`
- Test: `agent/internal/modules/privilege_test.go`

**Interfaces:**
- Consumes: `golang.org/x/sys/windows`, `windows.CheckTokenMembership`
- Produces: Sub-millisecond native Windows admin privilege checks without spawning `powershell.exe`.

- [ ] **Step 1: Write test for privilege check**
- [ ] **Step 2: Implement native Windows token elevation check**
- [ ] **Step 3: Run `go test ./agent/internal/modules -run TestIsAdmin -v`**
- [ ] **Step 4: Commit**
```bash
git add agent/internal/modules/privilege.go agent/internal/modules/privilege_windows.go agent/internal/modules/privilege_other.go agent/internal/modules/privilege_test.go
git commit -m "perf(agent): replace powershell privilege check with native Win32 token query"
```

---

### Task 4: Registry Hive Companion Transaction Logs (.LOG1, .LOG2)

**Files:**
- Modify: `agent/internal/modules/windows_artifacts.go`
- Test: `agent/internal/modules/windows_artifacts_test.go`

**Interfaces:**
- Consumes: `CopyFileNativeBackup`, `copyNative`
- Produces: Complete collection of dirty registry hives with `.LOG1` and `.LOG2` files.

- [ ] **Step 1: Write unit test for registry log companion collection**
- [ ] **Step 2: Update `WindowsRegistryHives` and `WindowsNtuserDat` to copy `.LOG1` and `.LOG2`**
- [ ] **Step 3: Run `go test ./agent/internal/modules -run TestRegistryLogs -v`**
- [ ] **Step 4: Commit**
```bash
git add agent/internal/modules/windows_artifacts.go agent/internal/modules/windows_artifacts_test.go
git commit -m "feat(agent): collect companion .LOG1 and .LOG2 registry transaction logs"
```

---

### Task 5: Multi-User Scoping for Interactive User Artifacts

**Files:**
- Modify: `agent/internal/modules/windows_artifacts.go`
- Modify: `agent/internal/modules/macos_modules.go`
- Test: `agent/internal/modules/macos_modules_test.go`

**Interfaces:**
- Consumes: `HKEY_USERS` enumeration, `/Users/*` directory inspection
- Produces: Collection of Shellbags, MRU lists, and Bash/Zsh history across all interactive user profiles.

- [ ] **Step 1: Write tests for multi-user directory resolution**
- [ ] **Step 2: Update `windows_artifacts.go` and `macos_modules.go`**
- [ ] **Step 3: Run tests and commit**
```bash
git add agent/internal/modules/windows_artifacts.go agent/internal/modules/macos_modules.go agent/internal/modules/macos_modules_test.go
git commit -m "feat(agent): support multi-user artifact scoping on Windows and macOS"
```

---

### Task 6: Constant-Time Comparison for Export Signatures

**Files:**
- Modify: `backend/app/api/v1/endpoints/evidence.py`
- Test: `backend/tests/test_evidence_signature.py`

**Interfaces:**
- Consumes: `hmac.compare_digest`
- Produces: Timing-attack resistant export signature verification.

- [ ] **Step 1: Write test for signature verification**
- [ ] **Step 2: Update `evidence.py` to use `hmac.compare_digest`**
- [ ] **Step 3: Run tests and commit**
```bash
git add backend/app/api/v1/endpoints/evidence.py backend/tests/test_evidence_signature.py
git commit -m "fix(security): use constant-time comparison for export signatures"
```

---

### Task 7: Phase 1 Full Regression Verification

**Files:**
- Run: Full backend, agent, and frontend test suites
- Produces: Clean green test runs across all subsystems.

- [ ] **Step 1: Run backend test suite** (`pytest`)
- [ ] **Step 2: Run Go agent test suite** (`go test ./...`)
- [ ] **Step 3: Run frontend typecheck, linter, and build**
