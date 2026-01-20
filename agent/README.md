# DFIR Agent

Go-based endpoint agent for DFIR Rapid Collection Kit.

## Overview

The DFIR agent runs on target systems (Windows and Linux) and communicates with the DFIR backend to:
- Register itself with the backend
- Poll for and execute collection jobs
- Report periodic heartbeats
- Upload collected evidence as ZIP files

## Features

- **OS Detection**: Automatically detects OS/arch at startup
- **Module System**: Extensible registry for collection modules
- **Windows Modules**:
  - Security, System, Application event logs
  - PowerShell Operational and Sysmon logs (if present)
  - Process list, network connections, listening ports, DNS cache
  - Scheduled tasks, services, run keys, startup folders, WMI subscriptions
  - Local users, logged-on users
  - System info, installed patches, timezone, boot time
- **Linux Modules**:
  - systemd journal, syslog/messages, auth logs
  - wtmp/btmp (last output)
  - Cron, systemd services/timers, rc.local, authorized_keys
  - Process list, network connections, IP config, resolv.conf
  - Bash history, logged-in users
  - Installed packages, kernel version
- **Secure Communication**: Uses shared secret authentication
- **Evidence ZIP**: Automatically creates compressed ZIP uploads
- **Dry Run**: Execute modules locally without backend

## Architecture

```
agent/cmd/agent/main.go       → Entry point
agent/internal/config/              → Configuration loading
agent/internal/api/                 → HTTP client for backend
agent/internal/agent/               → Main agent loop (registration, polling, execution)
agent/internal/jobs/                → Job execution engine
agent/internal/modules/              → Module registry + OS-specific implementations
agent/internal/storage/             → Work directory management
agent/internal/logging/             → Logger wrapper
```

## Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|----------|
| `DFIR_BACKEND_URL` | Backend API base URL | Yes | `http://localhost:8000/api/v1` |
| `DFIR_AGENT_SECRET` | Agent shared secret for auth | Yes | - |
| `DFIR_HOSTNAME` | Target system hostname | No | OS hostname |
| `DFIR_IP_ADDRESS` | Target IP address | No | (if discoverable) |
| `DFIR_TYPE` | Agent/device type | No | - |
| `DFIR_AGENT_ID` | Force specific agent ID | No | Auto-generated |
| `DFIR_DEBUG` | Enable debug logging | No | `false` |

## Building

```bash
# Build for current platform
go build -o dfir-agent ./cmd/agent

# For Windows
GOOS=windows GOARCH=amd64 go build -o dfir-agent.exe ./cmd/agent

# For Linux
GOOS=linux GOARCH=amd64 go build -o dfir-agent ./cmd/agent
```

## Running

```bash
# With all environment variables
DFIR_BACKEND_URL=http://localhost:8000/api/v1 \
DFIR_AGENT_SECRET=your-secret-here \
./dfir-agent

# With debug logging enabled
DFIR_DEBUG=true \
DFIR_BACKEND_URL=http://localhost:8000/api/v1 \
DFIR_AGENT_SECRET=your-secret-here \
./dfir-agent
```

## Dry Run

```bash
# Run selected modules locally without backend
./dfir-agent --dry-run --modules windows_eventlog_security,windows_process_list

# Specify output directory
./dfir-agent --dry-run --modules linux_process_list,linux_journalctl --workdir ./output
```

## Agent Lifecycle

1. **Startup**:
   - Detects OS and architecture
   - Loads/generates persistent agent ID
   - Registers with backend
   - Starts heartbeat and job polling

2. **Job Execution**:
   - Polls backend for pending jobs
   - Creates work directory for job
   - Executes modules in sequence
   - Creates evidence ZIP
   - Uploads to backend
   - Reports status updates throughout

3. **Heartbeat**:
   - Sends periodic status updates (every 30s by default)
   - Reports "ONLINE" status

4. **Shutdown**:
   - Handles SIGTERM gracefully
   - Finishes current job before shutdown
   - Cleans up work directory

## Security

- All module commands are predefined (no shell injection risk)
- Agent authentication via `X-Agent-Token` header
- No arbitrary code execution
- Path validation prevents directory traversal

## Module Configuration

Modules are defined in `MODULE_REGISTRY` in backend. The agent receives module IDs and parameters via `JobInstruction` JSON from the backend.

Example job instruction:
```json
{
  "job_id": "JOB-INC-2025-001",
  "incident_id": "INC-2025-001",
  "os": "Windows",
  "work_dir": "/vault/evidence/INC-2025-001/JOB-INC-2025-001",
  "modules": [
    {
      "module_id": "windows_eventlog_security",
      "output_relpath": "logs/windows/security.evtx",
      "params": { "time_window": "7d" }
    }
  ]
}
```

## Integration with Backend

The agent integrates with the existing backend API endpoints:
- `POST /agents/register` - Initial registration
- `POST /agents/{agent_id}/heartbeat` - Status updates
- `GET /agents/{agent_id}/jobs/next` - Poll for jobs
- `POST /agents/{agent_id}/jobs/{job_id}/status` - Status updates
- `POST /agents/{agent_id}/jobs/{job_id}/upload` - Evidence upload

See `backend/app/api/v1/endpoints/agents.py` for detailed API schemas.
