# DFIR Agent

Go-based endpoint agent for DFIR Rapid Collection Kit.

## Overview

The DFIR agent runs on target systems (Windows and Linux) and communicates with the DFIR backend to:
- Register itself with the backend
- Poll for and execute collection jobs
- Report periodic heartbeats
- Upload collected evidence as ZIP files

## Features

- **OS Detection**: Automatically detects Windows or Linux at startup
- **Module System**: Extensible registry for collection modules
- **Windows Modules**:
  - Security event logs (7 days)
  - System event logs (7 days)
  - PowerShell event logs (7 days)
  - Process list
  - Network connections (established TCP connections)
  - Scheduled tasks
  - Autorun entries
- **Linux Modules**:
  - Process list
  - Network connections (established TCP)
  - System logs (syslog/messages)
  - Authentication logs (auth.log/secure)
  - Cron jobs
  - Logged-in users
- **Secure Communication**: Uses shared secret authentication
- **Evidence ZIP**: Automatically creates compressed ZIP uploads

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
      "module_id": "windows_event_logs_security_7d",
      "output_relpath": "logs/Security.evtx",
      "params": { "time_window": "7d" }
    }
  ]
}
```

## Integration with Backend

The agent integrates with the existing backend API endpoints:
- `POST /agents/register` - Initial registration
- `POST /{agent_id}/heartbeat` - Status updates
- `GET /{agent_id}/jobs/next` - Poll for jobs
- `POST /{agent_id}/jobs/{job_id}/status` - Status updates
- `POST /{agent_id}/jobs/{job_id}/upload` - Evidence upload

See `backend/app/api/v1/endpoints/agents.py` for detailed API schemas.
