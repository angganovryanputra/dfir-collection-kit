# DFIR Rapid Collection Kit — API Reference

This document provides a comprehensive specification of all REST and WebSocket API endpoints available in the DFIR Rapid Collection Kit backend (`/api/v1`).

---

## 1. Authentication & Security Model

The API employs a dual authentication model depending on the caller:

### 1.1 Web UI / Operator Endpoints
Protected using standard JWT Bearer tokens:
```http
Authorization: Bearer <access_token>
```
- Tokens are issued upon successful authentication at `POST /api/v1/auth/login`.
- Role-based permissions are enforced: `admin` > `operator` > `viewer`.
- Expired tokens can be refreshed at `POST /api/v1/auth/refresh`.

### 1.2 Agent-Facing Endpoints
Protected using the shared secret header:
```http
X-Agent-Token: <AGENT_SHARED_SECRET>
```
- Compared on the backend using timing-attack-resistant `hmac.compare_digest`.
- Required for agent registration, heartbeat, job polling, command polling, command results, and evidence upload.

---

## 2. Authentication (`/api/v1/auth`)

| Method | Endpoint | Access | Description |
|:-------|:---------|:-------|:------------|
| `POST` | `/auth/login` | Public | Authenticate user via username and password. Returns JWT token and user info. (Rate limited: 20 req/min). |
| `POST` | `/auth/logout` | Authenticated | Invalidate current session. |
| `POST` | `/auth/refresh` | Authenticated | Issue refreshed JWT token before expiration. |

---

## 3. Agent Endpoints (`/api/v1/agents`)

These endpoints facilitate communication between target endpoints running the Go agent and the backend server.

### 3.1 Register Agent
- **Endpoint**: `POST /api/v1/agents/register`
- **Auth**: `X-Agent-Token: <token>`
- **Request Body**:
```json
{
  "hostname": "WORKSTATION-01",
  "os": "windows",
  "os_version": "10.0.19045",
  "ip_address": "192.168.1.105",
  "type": "workstation",
  "agent_version": "2.1.0"
}
```
- **Response** `(200 OK)`:
```json
{
  "device_id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "status": "registered",
  "message": "Device successfully registered"
}
```

### 3.2 Poll Next Job
- **Endpoint**: `GET /api/v1/agents/{agent_id}/jobs/next`
- **Auth**: `X-Agent-Token: <token>`
- **Response** `(200 OK)`: Returns `JobInstruction` if a collection is scheduled for this agent:
```json
{
  "job_id": "JOB-2026-0042",
  "incident_id": "INC-2026-0010",
  "os": "windows",
  "concurrency_limit": 4,
  "collection_timeout_min": 60,
  "retry_attempts": 3,
  "modules": [
    {
      "module_id": "windows_process_list",
      "output_relpath": "volatile/windows/process_list.csv",
      "params": {}
    },
    {
      "module_id": "windows_eventlog_security",
      "output_relpath": "logs/windows/security.evtx",
      "params": { "time_window": "7d" }
    }
  ]
}
```
- **Response** `(404 Not Found)`: No pending job queued.

### 3.3 Heartbeat
- **Endpoint**: `POST /api/v1/agents/{agent_id}/heartbeat`
- **Auth**: `X-Agent-Token: <token>`
- **Request Body**:
```json
{
  "status": "online",
  "cpu_usage": 4.2,
  "memory_usage": 42.1,
  "collection_status": "idle"
}
```
- **Response** `(200 OK)`: `{ "status": "acknowledged" }`

### 3.4 Upload Evidence ZIP
- **Endpoint**: `POST /api/v1/agents/{agent_id}/jobs/{job_id}/upload`
- **Auth**: `X-Agent-Token: <token>`
- **Content-Type**: `multipart/form-data`
- **Payload**: `file` (ZIP archive containing collected files and `/parsed` outputs).
- **Behavior**: Backend streams file to `/vault/evidence/{incident_id}/{job_id}/`, verifies checksums, extracts files, calculates SHA-256 for all contents, records chain of custody, and writes immutable `LOCKED` file.

---

## 4. Live Command Execution (`/api/v1/agent-commands`)

Enables real-time remote shell commands from the Web UI console (`AgentConsole.tsx`) to target agents.

| Method | Endpoint | Auth | Description |
|:-------|:---------|:-----|:------------|
| `POST` | `/agent-commands/run` | JWT (`operator`+) | Dispatch an ad-hoc shell command to an agent. Recorded in Audit Log. |
| `GET` | `/agent-commands/poll/{agent_id}` | `X-Agent-Token` | Agent polls for the next pending shell command (long-poll / sub-5s interval). |
| `POST` | `/agent-commands/result/{command_id}` | `X-Agent-Token` | Agent submits stdout/stderr and exit code. Broadcasts to WebSocket. |
| `GET` | `/agent-commands/history/{agent_id}` | JWT (`viewer`+) | Retrieve execution history and outputs for an endpoint. |
| `WS` | `/agent-commands/ws/{agent_id}` | Query JWT (`?token=`) | WebSocket stream for live interactive console output in Web UI. |

### 4.1 Dispatch Command Request (`POST /agent-commands/run`)
```json
{
  "agent_id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "command": "whoami /all",
  "timeout_sec": 30
}
```

### 4.2 Agent Command Poll Response (`GET /agent-commands/poll/{agent_id}`)
```json
{
  "command_id": "cmd-8f3a12b4",
  "command": "whoami /all",
  "timeout_sec": 30
}
```

### 4.3 Agent Submit Result (`POST /agent-commands/result/{command_id}`)
```json
{
  "exit_code": 0,
  "output": "USER INFORMATION\n----------------\nUser Name: CONTOSO\\analyst\nSID: S-1-5-21-..."
}
```

---

## 5. Agent Binary Distribution (`/api/v1/agent-binary`)

Serves compiled agent binaries dynamically for multiplatform deployment.

### 5.1 Query Available Binaries
- **Endpoint**: `GET /api/v1/agent-binary/info`
- **Auth**: JWT (`viewer`+)
- **Response** `(200 OK)`:
```json
{
  "available": [
    { "os": "windows", "arch": "amd64", "filename": "dfir-agent.exe", "size": 15420312 },
    { "os": "linux", "arch": "amd64", "filename": "dfir-agent-linux", "size": 14210450 },
    { "os": "linux", "arch": "arm64", "filename": "dfir-agent-linux-arm64", "size": 13980120 },
    { "os": "macos", "arch": "arm64", "filename": "dfir-agent-darwin-arm64", "size": 14510200 },
    { "os": "macos", "arch": "amd64", "filename": "dfir-agent-darwin-amd64", "size": 14890100 }
  ],
  "windows_amd64": true,
  "linux_amd64": true,
  "linux_arm64": true,
  "macos_arm64": true,
  "macos_amd64": true
}
```

### 5.2 Download Binary
- **Endpoint**: `GET /api/v1/agent-binary/download?os={os}&arch={arch}`
- **Auth**: Cookies / JWT
- **Parameters**:
  - `os`: `windows`, `linux`, `macos` (or `darwin`)
  - `arch`: `amd64`, `arm64`
- **Response**: Binary octet-stream attachment with `Content-Disposition`.

---

## 6. Incidents (`/api/v1/incidents`)

| Method | Endpoint | Access | Description |
|:-------|:---------|:-------|:------------|
| `GET` | `/incidents` | `viewer`+ | List incidents with filtering (status, severity, search) and pagination. |
| `POST` | `/incidents` | `operator`+ | Create a new incident. Supports template application. |
| `GET` | `/incidents/{id}` | `viewer`+ | Retrieve full incident details, attached devices, and collection state. |
| `PATCH` | `/incidents/{id}` | `operator`+ | Update incident status (`PENDING`, `ACTIVE`, `COMPLETE`, `CLOSED`), severity, notes. |
| `POST` | `/incidents/{id}/collect` | `operator`+ | Trigger evidence collection across specified target devices with a profile. |
| `GET` | `/incidents/{id}/report` | `viewer`+ | Generate and download consolidated HTML forensic report. |

---

## 7. Forensics Pipeline (`/api/v1/processing`)

Orchestrates background parsing workers (EZTools, Hayabusa, Chainsaw, DuckDB Super Timeline).

| Method | Endpoint | Access | Description |
|:-------|:---------|:-------|:------------|
| `POST` | `/processing/trigger` | `operator`+ | Trigger pipeline execution for an incident job. |
| `GET` | `/processing/incident/{id}/status` | `viewer`+ | Pipeline stage statuses (PARSING, SIGMA_HUNT, TIMELINE_BUILD, ANALYTICS). |
| `GET` | `/processing/incident/{id}/sigma-hits` | `viewer`+ | Detections from Sigma rules matching EVTX logs. |
| `GET` | `/processing/incident/{id}/yara-matches` | `viewer`+ | Files matching compiled YARA signatures. |
| `GET` | `/processing/incident/{id}/ioc-matches` | `viewer`+ | Timeline items matching IP, domain, and hash IOCs. |
| `GET` | `/processing/incident/{id}/attack-chains` | `viewer`+ | Reconstructed MITRE ATT&CK kill chain tactics and techniques. |

---

## 8. Evidence Vault & Super Timeline (`/api/v1/evidence`)

| Method | Endpoint | Access | Description |
|:-------|:---------|:-------|:------------|
| `GET` | `/evidence/folders` | `viewer`+ | List evidence storage folders by incident. |
| `GET` | `/evidence/items` | `viewer`+ | List evidence items within a folder with hash digests. |
| `GET` | `/evidence/{fid}/items/{iid}/download` | `viewer`+ | Download individual evidence file. |
| `POST` | `/evidence/{incident_id}/export` | `operator`+ | Export entire incident evidence folder as signed ZIP archive. |
| `GET` | `/evidence/super-timeline/{incident_id}` | `viewer`+ | Full-text search and query across normalized super timeline in DuckDB. |
| `GET` | `/evidence/super-timeline/{incident_id}/export` | `viewer`+ | Export super timeline results as `csv` or `jsonl`. |

### 8.1 Super Timeline Query Parameters (`GET /super-timeline/{incident_id}`)
- `q`: Free-text search across `description`, `details`, and `user`.
- `source`: Filter by data source (e.g., `Security.evtx`, `Prefetch`, `UnifiedLog`).
- `hosts`: Comma-separated list of computer names.
- `date_from`, `date_to`: ISO-8601 date filters.
- `page`, `page_size`: Pagination control.
- `sort_by`, `sort_dir`: Sorting (`datetime`, `computer`, `source`, `asc`/`desc`).

---

## 9. Chain of Custody & Audit Logs

### 9.1 Chain of Custody (`/api/v1/chain-of-custody`)
- `GET /api/v1/chain-of-custody?incident_id={id}`: Retrieves chain of custody. Backend verifies every cryptographic SHA-256 hash in sequence before returning data. Returns `409 Conflict` if tampering is detected.
- `POST /api/v1/chain-of-custody`: Manually record custody transfer, analysis action, or court submission.
- `GET /api/v1/chain-of-custody/export?incident_id={id}`: Download signed CSV evidence custody log.

### 9.2 Audit Logs (`/api/v1/audit-logs`)
- `GET /api/v1/audit-logs`: System-wide audit log of user logins, role changes, setting updates, live command executions, and evidence downloads.

---

## 10. Device Management (`/api/v1/devices`)

| Method | Endpoint | Access | Description |
|:-------|:---------|:-------|:------------|
| `GET` | `/devices` | `viewer`+ | List all enrolled endpoints, status, OS, agent version, last seen. |
| `PATCH` | `/devices/{id}` | `operator`+ | Update device metadata or friendly name. |
| `DELETE` | `/devices/{id}` | `admin` | Remove device from registry. |
