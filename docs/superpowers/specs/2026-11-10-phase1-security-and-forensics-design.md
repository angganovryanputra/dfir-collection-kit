# Phase 1: Security & Forensic Integrity Design Document

**Status:** Approved  
**Author:** Multi-Agent Audit Taskforce  
**Target:** DFIR Rapid Collection Kit — Phase 1 Remediation  
**Date:** 2026-11-10  

---

## 1. Executive Summary

Phase 1 addresses critical security, anti-tampering, and forensic accuracy gaps identified during the comprehensive code review:
1. **BE-GAP-01**: Hard-deletion in `audit_logs.py` breaks SHA-256 hash chains upon retention pruning.
2. **BE-GAP-02**: Live agent command queuing in `agent_commands.py` uses process-local memory, failing in multi-worker Uvicorn or horizontally scaled environments.
3. **AG-GAP-01**: Agent privilege checks in `privilege.go` spawn `powershell.exe` for every module (50+ child processes per job), causing latency and triggering EDR alerts.
4. **AG-GAP-03 & AG-GAP-04**: Windows `HKCU` and macOS user directory access resolve to service/root context (`S-1-5-18`, `/var/root`), missing interactive human user artifacts.
5. **AG-GAP-05**: Registry hive acquisition omits `.LOG1` and `.LOG2` transaction logs, preventing recovery of dirty live hives.
6. **BE-GAP-07**: Evidence export signature comparison uses standard equality operator `!=` instead of constant-time comparison `hmac.compare_digest`.

---

## 2. Architectural Design & Technical Specifications

### 2.1 Audit Hash Chain Preservation & Archival Genesis Checkpoint (BE-GAP-01)
- **Problem**: Calling `GET /api/v1/audit-logs/` automatically ran `prune_old_entries()`, which issued `DELETE FROM audit_logs WHERE timestamp < cutoff`. When earlier entries are deleted, the hash chain is severed because the earliest remaining entry's `previous_hash` points to a non-existent deleted record.
- **Solution**:
  1. **Remove auto-prune on read**: Read endpoints (`GET /api/v1/audit-logs/`) must NEVER mutate database state or prune logs.
  2. **Archival Genesis Checkpoint**: When explicit pruning occurs (via `POST /api/v1/audit-logs/prune` or background task):
     - Identify the last entry being pruned (the most recent entry before cutoff).
     - Instead of breaking the chain, create a signed Checkpoint Genesis record:
       ```python
       event_type="audit.archive_checkpoint"
       action="archive_checkpoint"
       message=f"Archival checkpoint: pruned {count} logs prior to {cutoff.isoformat()}"
       previous_hash=last_pruned_entry.entry_hash
       ```
     - Compute the checkpoint's `entry_hash` chaining from `last_pruned_entry.entry_hash`.
     - Delete records older than the checkpoint.
  3. **Verification Endpoint**:
     - Provide `verify_audit_log_chain(entries: list[AuditLog]) -> tuple[bool, str | None]`.
     - Expose `GET /api/v1/audit-logs/verify` requiring `admin` role, returning `{ "valid": true, "count": N, "genesis_hash": ... }`.

### 2.2 Distributed Redis Command Queue & Pub/Sub (BE-GAP-02)
- **Problem**: In-memory dictionaries (`_pending`, `_ws_queues`, `_command_agents`) in `agent_commands.py` fail when the FastAPI application is scaled across multiple Uvicorn workers or containers (e.g. agent polls worker 1, analyst WebSocket connects to worker 2).
- **Solution**:
  - Implement a distributed Redis message broker layer in `app/core/redis_bus.py`:
    - **Agent Command Queue**: `LPUSH dfir:agent:commands:{agent_id}` and `RPOP dfir:agent:commands:{agent_id}`.
    - **Console Stream Pub/Sub**: Channel `dfir:console:command:{command_id}`. When the agent posts chunks or completion to `POST /api/v1/agent-commands/{command_id}/output`, the backend publishes messages to Redis channel `dfir:console:command:{command_id}`.
    - **WebSocket Subscriber**: Analyst WebSocket subscribes to the command's Redis channel and streams received JSON events directly to the browser.
    - **Resilient Fallback**: If `settings.REDIS_URL` is empty (local standalone development), seamlessly fall back to local thread-safe in-memory asyncio queues.

### 2.3 Native Win32 Admin Privilege Verification (AG-GAP-01)
- **Problem**: Spawning `powershell.exe -NoProfile -Command "[bool]..."` takes 500-1500ms per module, spawns 50+ child processes, and leaves noisy process-creation telemetry in Windows Security Event Logs and EDR products.
- **Solution**:
  - On Windows (`//go:build windows` in `agent/internal/modules/privilege_windows.go`):
    - Use `golang.org/x/sys/windows`.
    - Allocate `SECURITY_BUILTIN_DOMAIN_RID` / `DOMAIN_ALIAS_RID_ADMINS` SID using `windows.AllocateAndInitializeSid`.
    - Call `windows.Token(0).IsMember(sid)` or `windows.CheckTokenMembership`.
    - Returns in < 1 millisecond with zero child process spawns.
  - On Unix/macOS (`//go:build !windows` in `agent/internal/modules/privilege_unix.go`):
    - Retain `os.Geteuid() == 0`.

### 2.4 Multi-User Artifact Scoping (AG-GAP-03 & AG-GAP-04)
- **Problem**: When the agent runs as `NT AUTHORITY\SYSTEM` service on Windows or `root` daemon on macOS, `HKCU` maps to system SID `S-1-5-18`, and `os.UserHomeDir()` maps to `/var/root`. Interactive user activity (Shellbags, MRU lists, Bash/Zsh history) is omitted.
- **Solution**:
  - **Windows Shellbags & MRU**:
    - Enumerate loaded user hives in `Registry::HKEY_USERS`: filter SIDs matching user pattern (`S-1-5-21-*` excluding `_Classes`).
    - Query Shellbags and MRU paths under each loaded user SID in addition to `HKCU`.
  - **macOS User Shell History**:
    - Implement `getUserHomeDirs()`: inspect `/Users/*` (excluding `Shared`, `.localized`, `Guest`).
    - Collect `.bash_history` and `.zsh_history` across all human user directories.

### 2.5 Registry Hive Transaction Logs (`.LOG1`, `.LOG2`) (AG-GAP-05)
- **Problem**: Live Windows registry hives (`SYSTEM`, `SOFTWARE`, `SAM`, `SECURITY`, `NTUSER.DAT`) are dirty and actively modified in RAM. Without companion `.LOG1` and `.LOG2` files, forensic tools like Eric Zimmerman's `RECmd` cannot replay uncommitted transaction logs.
- **Solution**:
  - In `WindowsRegistryHives`: for each hive, copy `hive.path`, `hive.path + ".LOG1"`, and `hive.path + ".LOG2"` if they exist using `CopyFileNativeBackup`.
  - In `WindowsNtuserDat`: copy `NTUSER.DAT`, `NTUSER.DAT.LOG1`, `NTUSER.DAT.LOG2`, `UsrClass.dat`, `UsrClass.dat.LOG1`, and `UsrClass.dat.LOG2`.

### 2.6 Timing-Safe Signature Comparison (BE-GAP-07)
- **Problem**: `evidence.py:228` compares export signatures with `if signature != expected:`, vulnerable to byte-by-byte timing side-channel attacks.
- **Solution**:
  - Use `hmac.compare_digest(signature, expected)` for constant-time evaluation.

---

## 3. Verification & Compliance Criteria
- Backend test suite with pytest must pass 100%.
- Go agent test suite must build and pass 100% across all modules without external CGO dependencies.
- Frontend typecheck and build must pass with 0 errors.
