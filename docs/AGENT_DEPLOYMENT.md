# Agent Deployment Guide — DFIR Rapid Collection Kit

This guide covers everything needed to build, deploy, and manage the DFIR Go agent on Windows and Linux endpoints.

---

## Overview

The DFIR agent is a lightweight, persistent binary that:

1. **Registers** with the backend on first run
2. **Polls** for collection jobs with OPSEC-aware jitter
3. **Executes** modules in parallel to collect volatile and forensic artifacts
4. **Parses** collected artifacts locally (EVTX, Prefetch, LNK, Browser History)
5. **Uploads** evidence ZIP to the backend
6. **Locks** evidence to prevent tampering

The agent is built in Go 1.23 for fast startup, minimal dependencies, and cross-platform compatibility. Agent ID persists locally, allowing seamless re-registration if the agent restarts.

---

## Prerequisites

### Server-Side Requirements

Before deploying agents, ensure the backend is running:

1. Start the backend: `make up` or `docker compose up -d`
2. Run migrations: `make migrate` or `alembic upgrade head`
3. Seed default users: `make seed`
4. Obtain `DFIR_AGENT_SECRET` (backend's `AGENT_SHARED_SECRET` value)
5. Note the backend URL (e.g., `http://10.0.0.5:8000/api/v1`)

The backend serves the API on port 8000 by default. Ensure network connectivity from target endpoints to this port.

### Agent Binary Prerequisites

- **Windows**: No dependencies (bundled libraries)
- **Linux**: `glibc` 2.29+ (standard on Ubuntu 20.04+, Debian 11+, CentOS 8+, RHEL 8+)
- **macOS**: Not supported (no Go module implementations)

---

## Building the Agent

### Using Makefile (Recommended)

The `Makefile` provides cross-compilation targets. Build from any platform:

```bash
# Build for Windows (amd64)
make agent-windows
# Output: agent/dist/dfir-agent.exe

# Build for Linux (amd64)
make agent-linux
# Output: agent/dist/dfir-agent-linux

# Build for Linux (ARM64)
make agent-linux-arm64
# Output: agent/dist/dfir-agent-linux-arm64

# Build all three
make agent-all
# Outputs all three binaries to agent/dist/
```

Binaries are optimized with `-trimpath` and `-ldflags="-s -w"` for reduced size and obscured paths.

### Manual Cross-Compilation

If you prefer manual `go build` commands:

```bash
cd agent

# Windows
GOOS=windows GOARCH=amd64 CGO_ENABLED=0 \
  go build -trimpath -ldflags="-s -w" \
  -o dist/dfir-agent.exe ./cmd/agent

# Linux amd64
GOOS=linux GOARCH=amd64 CGO_ENABLED=0 \
  go build -trimpath -ldflags="-s -w" \
  -o dist/dfir-agent-linux ./cmd/agent

# Linux ARM64
GOOS=linux GOARCH=arm64 CGO_ENABLED=0 \
  go build -trimpath -ldflags="-s -w" \
  -o dist/dfir-agent-linux-arm64 ./cmd/agent
```

---

## Configuration

### Environment Variables

All agent configuration is via environment variables with the `DFIR_` prefix:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DFIR_BACKEND_URL` | Yes | `http://localhost:8000/api/v1` | Backend API URL |
| `DFIR_AGENT_SECRET` | Yes | — | Shared secret (must match backend `AGENT_SHARED_SECRET`) |
| `DFIR_AGENT_ID` | No | (auto-generated) | Unique agent identifier; auto-generated and saved to `~/.dfir-agent/agent_id.json` if not set |
| `DFIR_HOSTNAME` | No | (system hostname) | Override reported hostname |
| `DFIR_IP_ADDRESS` | No | (auto-detected) | Override reported IP address |
| `DFIR_TYPE` | No | (empty) | Device type label (e.g., "server", "workstation") |

**Critical:** `DFIR_AGENT_SECRET` must exactly match the backend's `AGENT_SHARED_SECRET`. Verify with:

```bash
# On the backend server
docker compose exec backend env | grep AGENT_SHARED_SECRET
# Or check .env
grep AGENT_SHARED_SECRET .env
```

### Getting Agent Configuration

Use the `make agent-config` target to display the correct environment for agents:

```bash
make agent-config
```

Output:
```
  Agent configuration:

  # Copy to target host as dfir-agent.env
  DFIR_BACKEND_URL=https://<this-server-ip>/api/v1
  DFIR_AGENT_SECRET=<your-shared-secret>

  Run agent (Windows):
    set DFIR_BACKEND_URL=https://<server>/api/v1
    set DFIR_AGENT_SECRET=<secret>
    dfir-agent.exe
```

### Agent ID Persistence

If `DFIR_AGENT_ID` is not set, the agent auto-generates a unique UUID and saves it to:
- **Windows**: `%USERPROFILE%\.dfir-agent\agent_id.json`
- **Linux**: `~/.dfir-agent/agent_id.json`
- **macOS**: `~/.dfir-agent/agent_id.json`

This ensures the same agent is recognized across restarts, allowing the backend to correlate jobs and uploads to the same device.

### Creating an Environment File

For repeated deployments, create a `.env` file with all agent variables:

```bash
# dfir-agent.env
DFIR_BACKEND_URL=http://10.0.0.5:8000/api/v1
DFIR_AGENT_SECRET=your-shared-secret-here
DFIR_HOSTNAME=WORKSTATION-01
DFIR_TYPE=workstation
```

---

## Deployment on Windows

### PowerShell Quick Start

```powershell
# Set environment variables in current session
$env:DFIR_BACKEND_URL = "http://10.0.0.5:8000/api/v1"
$env:DFIR_AGENT_SECRET = "your-shared-secret"

# Run the agent
.\dfir-agent.exe
```

### From Environment File (Batch)

Create `dfir-agent.bat`:

```batch
@echo off
setlocal enabledelayedexpansion

:: Load environment
for /f "tokens=1,2 delims==" %%A in (dfir-agent.env) do (
    set "%%A=%%B"
)

echo Starting DFIR Agent...
echo Backend: %DFIR_BACKEND_URL%
echo Agent ID: %DFIR_AGENT_ID%

dfir-agent.exe
pause
```

Run with:
```powershell
.\dfir-agent.bat
```

### Running as a Windows Service (Persistent)

For persistent agent operation across reboots, register the agent as a Windows service.

#### Option 1: Using NSSM (Recommended)

Download NSSM from https://nssm.cc/download

```powershell
# Extract NSSM and add to PATH
$nssm = "C:\path\to\nssm\win64\nssm.exe"

# Create service
& $nssm install DFIR-Agent "C:\path\to\dfir-agent.exe"

# Set environment variables (NSSM AppEnvironmentExtra)
& $nssm set DFIR-Agent AppEnvironmentExtra "DFIR_BACKEND_URL=http://10.0.0.5:8000/api/v1`nDFIR_AGENT_SECRET=your-secret"

# Start service
& $nssm start DFIR-Agent

# View logs
& $nssm get DFIR-Agent AppStderr
```

#### Option 2: Using sc.exe (Built-in)

Create a service wrapper batch file (`dfir-agent-service.bat`):

```batch
@echo off
setlocal

:: Load environment from file
for /f "tokens=1,2 delims==" %%A in (dfir-agent.env) do (
    set "%%A=%%B"
)

:: Export to process environment
set DFIR_BACKEND_URL=%DFIR_BACKEND_URL%
set DFIR_AGENT_SECRET=%DFIR_AGENT_SECRET%

:: Run agent
cd /d "%~dp0"
dfir-agent.exe
```

Register with `sc.exe`:

```powershell
sc.exe create DFIR-Agent `
  binPath= "C:\full\path\to\dfir-agent-service.bat" `
  start= auto `
  DisplayName= "DFIR Agent"

sc.exe start DFIR-Agent
```

### Running as a Scheduled Task

Create a scheduled task to run the agent periodically:

```powershell
# Create trigger (daily at 9 AM, repeating every 10 minutes)
$trigger = New-ScheduledTaskTrigger `
  -Daily `
  -At 09:00 `
  -RepetitionInterval (New-TimeSpan -Minutes 10) `
  -RepetitionDuration (New-TimeSpan -Days 1000)

# Create action (run agent)
$action = New-ScheduledTaskAction `
  -Execute "C:\path\to\dfir-agent.exe" `
  -WorkingDirectory "C:\path\to"

# Create task with highest privileges
$principal = New-ScheduledTaskPrincipal `
  -UserId "SYSTEM" `
  -LogonType ServiceAccount `
  -RunLevel Highest

# Register task
Register-ScheduledTask `
  -TaskName "DFIR Agent" `
  -Description "DFIR Rapid Collection Agent" `
  -Trigger $trigger `
  -Action $action `
  -Principal $principal `
  -Force
```

### PowerShell Deployment Script

Quick deployment script for Windows:

```powershell
# dfir-deploy.ps1

param(
    [Parameter(Mandatory=$true)]
    [string]$BackendURL,

    [Parameter(Mandatory=$true)]
    [string]$AgentSecret,

    [Parameter(Mandatory=$false)]
    [string]$Hostname = $env:COMPUTERNAME,

    [Parameter(Mandatory=$false)]
    [string]$Type = "workstation"
)

Write-Host "DFIR Agent Deployment Script"
Write-Host "Backend: $BackendURL"
Write-Host "Hostname: $Hostname"
Write-Host ""

# Download agent (if needed)
if (-not (Test-Path "dfir-agent.exe")) {
    Write-Host "Downloading agent binary..."
    # Download from your repository
}

# Test connectivity
Write-Host "Testing backend connectivity..."
try {
    $health = Invoke-WebRequest "$BackendURL/health" -UseBasicParsing
    Write-Host "✓ Backend is reachable"
} catch {
    Write-Host "✗ Backend is unreachable: $_"
    exit 1
}

# Set environment and run
Write-Host "Starting agent..."
$env:DFIR_BACKEND_URL = $BackendURL
$env:DFIR_AGENT_SECRET = $AgentSecret
$env:DFIR_HOSTNAME = $Hostname
$env:DFIR_TYPE = $Type

.\dfir-agent.exe
```

Run with:
```powershell
.\dfir-deploy.ps1 -BackendURL "http://10.0.0.5:8000/api/v1" -AgentSecret "your-secret"
```

---

## Deployment on Linux

### Bash Quick Start

```bash
#!/bin/bash

export DFIR_BACKEND_URL="http://10.0.0.5:8000/api/v1"
export DFIR_AGENT_SECRET="your-shared-secret"
export DFIR_HOSTNAME="$(hostname)"

./dfir-agent-linux
```

### Running as a systemd Service (Recommended)

Create a systemd unit file at `/etc/systemd/system/dfir-agent.service`:

```ini
[Unit]
Description=DFIR Agent
Documentation=https://github.com/yourusername/dfir-collection-kit
Wants=network-online.target
After=network-online.target

[Service]
Type=simple
ExecStart=/usr/local/bin/dfir-agent-linux
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

# Security hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/root/.dfir-agent

# Environment
Environment="DFIR_BACKEND_URL=http://10.0.0.5:8000/api/v1"
Environment="DFIR_AGENT_SECRET=your-shared-secret"
EnvironmentFile=-/etc/dfir-agent.env

[Install]
WantedBy=multi-user.target
```

If using an environment file (`/etc/dfir-agent.env`):

```bash
DFIR_BACKEND_URL=http://10.0.0.5:8000/api/v1
DFIR_AGENT_SECRET=your-shared-secret
DFIR_HOSTNAME=host01.example.com
DFIR_TYPE=server
```

**Installation:**

```bash
# Copy agent binary
sudo cp dfir-agent-linux /usr/local/bin/dfir-agent
sudo chmod +x /usr/local/bin/dfir-agent

# Copy config file (if using EnvironmentFile)
sudo cp dfir-agent.env /etc/dfir-agent.env
sudo chmod 600 /etc/dfir-agent.env
sudo chown root:root /etc/dfir-agent.env

# Install systemd unit
sudo cp dfir-agent.service /etc/systemd/system/
sudo systemctl daemon-reload

# Enable and start
sudo systemctl enable dfir-agent
sudo systemctl start dfir-agent

# Verify
sudo systemctl status dfir-agent
sudo journalctl -u dfir-agent -f
```

### Running as a cron Job

For periodic collection intervals:

```bash
# Edit crontab
crontab -e

# Run agent every 15 minutes
*/15 * * * * /usr/local/bin/dfir-agent >> /var/log/dfir-agent.log 2>&1

# Or run once daily at 2 AM
0 2 * * * /usr/local/bin/dfir-agent >> /var/log/dfir-agent.log 2>&1
```

Create wrapper script `/usr/local/bin/dfir-agent-wrapper`:

```bash
#!/bin/bash
source /etc/dfir-agent.env
exec /usr/local/bin/dfir-agent
```

### Bash Deployment Script

Quick deployment for Linux:

```bash
#!/bin/bash
# dfir-deploy.sh

set -e

BACKEND_URL="${1:-http://localhost:8000/api/v1}"
AGENT_SECRET="${2:-}"
HOSTNAME="${3:-$(hostname)}"
TYPE="${4:-workstation}"

if [ -z "$AGENT_SECRET" ]; then
    echo "Usage: $0 <backend-url> <agent-secret> [hostname] [type]"
    exit 1
fi

echo "DFIR Agent Deployment Script"
echo "Backend: $BACKEND_URL"
echo "Hostname: $HOSTNAME"
echo ""

# Test connectivity
echo "Testing backend connectivity..."
if curl -sf "$BACKEND_URL/health" > /dev/null; then
    echo "✓ Backend is reachable"
else
    echo "✗ Backend is unreachable"
    exit 1
fi

# Copy binary
echo "Installing agent binary..."
sudo cp dfir-agent-linux /usr/local/bin/dfir-agent
sudo chmod +x /usr/local/bin/dfir-agent

# Create systemd unit
echo "Installing systemd service..."
cat <<EOF | sudo tee /etc/systemd/system/dfir-agent.service > /dev/null
[Unit]
Description=DFIR Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/usr/local/bin/dfir-agent
Restart=always
RestartSec=10

Environment="DFIR_BACKEND_URL=$BACKEND_URL"
Environment="DFIR_AGENT_SECRET=$AGENT_SECRET"
Environment="DFIR_HOSTNAME=$HOSTNAME"
Environment="DFIR_TYPE=$TYPE"

[Install]
WantedBy=multi-user.target
EOF

# Start service
echo "Starting agent..."
sudo systemctl daemon-reload
sudo systemctl enable dfir-agent
sudo systemctl start dfir-agent

echo "✓ Agent deployed and running"
echo ""
echo "View logs:"
echo "  sudo journalctl -u dfir-agent -f"
```

Run with:
```bash
./dfir-deploy.sh "http://10.0.0.5:8000/api/v1" "your-shared-secret" "host01"
```

---

## Agent Lifecycle

### Phase 1: Registration

On first run, the agent calls `POST /agents/register` with:

```json
{
  "hostname": "WORKSTATION-01",
  "os": "windows",
  "os_version": "10.0.19045",
  "ip_address": "192.168.1.100",
  "type": "workstation"
}
```

Backend responds with a `device_id`. The agent saves its auto-generated `agent_id` to disk for persistence.

### Phase 2: Job Polling

Agent enters a loop, calling `GET /agents/{agent_id}/jobs/next` every `PollInterval` seconds (default: 15 seconds) with jitter:

- **Jitter**: Default ±30% randomization on poll interval (OPSEC-aware)
- **Long-Polling**: Backend returns 404 if no job available; agent waits and retries
- **Heartbeat**: Every `HeartbeatInterval` (default: 30 seconds), agent sends status to `/agents/{agent_id}/heartbeat`

### Phase 3: Module Execution (Artifact Collection)

When a job is assigned, the agent:

1. Receives `JobInstruction` with list of modules and concurrency limit
2. Creates a working directory
3. Launches goroutine worker pool (size = `concurrency_limit`, default 4)
4. Distributes modules to workers; each worker executes its module sequentially
5. Module failure is non-fatal; continues with remaining modules
6. Sends status `"collecting"` or `"collecting (5/10)"` to indicate progress
7. Overall timeout: `collection_timeout_min` (default 60 minutes)

### Phase 4: Local Parsing

After all modules complete:

1. Agent's `parsers` package processes collected artifacts
2. Converts:
   - EVTX logs → JSONL (via `wevtutil.exe` on Windows)
   - Prefetch → CSV (binary parser with MAM decompression)
   - LNK files → CSV (binary parser)
   - Browser History (Chrome/Firefox/Edge) → CSV (pure-Go SQLite)
3. Outputs to `workdir/parsed/` subdirectories
4. Sends status `"parsing"` to backend
5. Parsing failures are non-fatal; uploads what was parsed

### Phase 5: ZIP + Upload

Agent:

1. Compresses entire workdir (including `parsed/` subdirectory) into `collection.zip`
2. Computes ZIP file size and CRC
3. Calls `POST /agents/{agent_id}/jobs/{job_id}/upload` with ZIP stream
4. Sends status `"uploading"` to backend
5. Backend receives, extracts, hashes, appends chain-of-custody, locks folder
6. Agent receives confirmation
7. Sends final status `"complete"`

### Phase 6: Evidence Locking (Backend)

After upload, the backend:

1. Extracts ZIP to `/{incident}/{job}/extracted/`
2. Computes SHA256 hash of every file
3. Writes `hashes.sha256` manifest (CSV: filename, size, sha256)
4. Appends chain-of-custody entry to `chain-of-custody.log`
5. Hashes the CoC log and appends entry hash
6. Creates database records for `EvidenceFolder` and `EvidenceItem`
7. Writes `LOCKED` marker file (prevents post-collection modification)

---

## Dry-Run Mode

Test the agent locally without a backend using dry-run mode:

```bash
# Windows
.\dfir-agent.exe --dry-run

# Linux
./dfir-agent-linux --dry-run
```

In dry-run mode:
- No backend communication
- Modules execute against local system
- Collections are staged in a temporary directory
- No evidence is uploaded
- Useful for testing module execution and parsing logic

---

## Verifying Deployment

### In the UI

1. Navigate to **Devices** page (`http://backend:5173/devices`)
2. Confirm your agent appears with:
   - **Hostname** (from `DFIR_HOSTNAME` or system hostname)
   - **OS** (Windows or Linux)
   - **Status** (Online if polling; Offline if no heartbeat in last 2 minutes)
   - **Last Seen** timestamp

### Via API

```bash
# List all registered devices
curl -H "Authorization: Bearer <token>" \
  http://localhost:8000/api/v1/devices

# Get a specific device
curl -H "Authorization: Bearer <token>" \
  http://localhost:8000/api/v1/devices/WORKSTATION-01
```

### In Logs

**Windows**: Check application event log or use `Get-EventLog`

**Linux systemd**:
```bash
sudo journalctl -u dfir-agent -f
```

Expected output:
```
[INFO] Starting agent (v1.0.0)
[INFO] Registered device: WORKSTATION-01 (ID: device-abc123)
[INFO] Polling for jobs every 15s with 30% jitter
[DEBUG] No job available, retrying in 18s
...
[INFO] Job received: JOB-2025-0001
[INFO] Executing 10 modules in parallel (concurrency: 4)
...
```

---

## OPSEC Notes

### Job Polling

- **Jitter**: Default ±30% randomization prevents predictable polling schedules
- **No Persistent Connections**: Agent disconnects after each poll (vs. WebSocket)
- **Standard Headers**: Mimics regular HTTP traffic, not agent-identifiable
- **User-Agent**: Standard Go HTTP user-agent (customizable if needed)

### Binary Naming

To reduce detection, consider renaming the binary:

```bash
# Windows
cp dfir-agent.exe svchost.exe

# Linux
cp dfir-agent-linux systemd-analyze
```

Note: This does not change the actual functionality; it only changes the reported process name.

### Network Communication

- **Protocol**: HTTPS (recommended for production)
- **Port**: 8000 (or custom port)
- **Authentication**: `X-Agent-Token` header (compared with `hmac.compare_digest`)
- **Upload**: Raw ZIP stream (no multipart encoding)

---

## Troubleshooting

### Agent Cannot Connect to Backend

**Symptoms**: Agent logs show connection refused or timeout

**Causes**:
1. Backend not running or unreachable
2. Wrong `DFIR_BACKEND_URL`
3. Network/firewall blocking port 8000
4. DNS resolution failure

**Fix**:
```bash
# Verify backend is running
curl http://backend-ip:8000/api/v1/status/health

# Verify agent config
echo $DFIR_BACKEND_URL
echo $DFIR_AGENT_SECRET

# Check network from target
ping backend-ip
telnet backend-ip 8000
```

### Agent Authentication Fails (401)

**Symptoms**: Agent logs show "unauthorized" or backend logs show "invalid token"

**Cause**: `DFIR_AGENT_SECRET` does not match backend `AGENT_SHARED_SECRET`

**Fix**:
```bash
# Verify backend secret
docker compose exec backend env | grep AGENT_SHARED_SECRET

# Update agent
export DFIR_AGENT_SECRET="<correct-secret>"
```

### Agent Stuck Polling (No Job)

**Symptoms**: Agent logs show "no job available" repeatedly

**Cause**: Normal behavior; no incident with this device has been created or collection not started

**Fix**:
1. Create incident in UI
2. Select target device
3. Start collection from Collection Setup page

### Module Execution Fails

**Symptoms**: Collection starts but some modules timeout or error

**Cause**:
- Module permissions issue (e.g., insufficient privileges)
- System resource exhaustion
- Module timeout too short

**Fix**:
```bash
# Increase timeout in job instruction
# Or lower concurrency limit to reduce resource contention
# Or run with elevated privileges (Windows: Admin; Linux: sudo or systemd)
```

### Upload Rejected (413 Payload Too Large)

**Symptoms**: Backend returns 413 when upload reaches max size

**Cause**: Evidence ZIP exceeds configured limit

**Fix**:
1. In backend Admin Settings, increase `max_file_size_gb`
2. Or limit collection scope (fewer modules, shorter time window)

### Agent Crashes on Startup

**Symptoms**: Service fails to start or process exits immediately

**Cause**:
- Missing `DFIR_AGENT_SECRET` environment variable
- Invalid working directory permissions

**Fix**:
```bash
# Windows: verify environment variables are set
set | findstr DFIR

# Linux: verify service environment
systemctl show dfir-agent --property=Environment

# Check temp directory permissions
ls -la /tmp  # Linux
dir %TEMP%  # Windows
```

---

## Collection Module Reference

### Windows Modules (40+)

| Category | Modules |
|----------|---------|
| **volatile** | `windows_process_list`, `windows_network_connections`, `windows_listening_ports`, `windows_dns_cache`, `windows_logged_on_users` |
| **logs** | `windows_eventlog_security`, `windows_eventlog_system`, `windows_eventlog_application`, `windows_eventlog_powershell_operational`, `windows_eventlog_sysmon_operational` |
| **persistence** | `windows_scheduled_tasks`, `windows_services`, `windows_registry_run_keys`, `windows_startup_folders`, `windows_wmi_event_subscriptions` |
| **artifacts** | `windows_registry_hives`, `windows_ntuser_dat`, `windows_prefetch`, `windows_amcache`, `windows_shimcache`, `windows_lnk_files`, `windows_jump_lists`, `windows_browser_chrome`, `windows_browser_edge`, `windows_bits_jobs`, `windows_recycle_bin`, `windows_thumbcache`, `windows_shellbags`, `windows_mru`, `windows_usb_history` |
| **system** | `windows_local_users`, `windows_system_info`, `windows_installed_patches`, `windows_timezone`, `windows_boot_time` |

**Volume Shadow Copy** (VSS) modules:
- `windows_mft_vss` — MFT from VSS snapshots
- `windows_usnjrnl_vss` — USN Journal from VSS snapshots

### Linux Modules (11+)

| Category | Modules |
|----------|---------|
| **volatile** | `linux_process_list`, `linux_network_connections` |
| **logs** | `linux_journalctl`, `linux_syslog`, `linux_auth_logs`, `linux_wtmp`, `linux_btmp` |
| **persistence** | `linux_cron`, `linux_systemd_units`, `linux_systemd_timers`, `linux_rc_local`, `linux_authorized_keys` |
| **system** | `linux_ip_config`, `linux_resolv_conf`, `linux_bash_history`, `linux_logged_in_users`, `linux_installed_packages`, `linux_kernel_version` |

### Module Profiles

Quick profiles for common scenarios:

**`triage`** (1–2 minutes)
- Windows: process list, network connections, eventlog_security, eventlog_system, registry_run_keys
- Linux: process list, network connections, journalctl, authorized_keys

**`ransomware`** (5–10 minutes)
- Extends triage with: all event logs, prefetch, services, scheduled tasks, amcache

**`insider_threat`** (5–10 minutes)
- Extends triage with: browser history, mru, shellbags, bash history, cron

**`full`** (15–30 minutes)
- All available modules for the OS

---

## Deployment Best Practices

### Security

1. **Use HTTPS**: Deploy backend behind SSL/TLS terminator
2. **Strong Secrets**: Generate cryptographically random `AGENT_SHARED_SECRET` (min 32 chars)
3. **Environment Isolation**: Store agent secrets in secure vaults, not plain files
4. **Minimal Privileges**: Run agent as non-admin user when possible (some modules require admin/root)
5. **Network Segmentation**: Restrict agent traffic to backend via firewall rules

### Reliability

1. **Service Recovery**: Configure systemd/Windows services with `Restart=always` and short restart delay
2. **Logging**: Redirect logs to centralized log aggregator (ELK, Splunk)
3. **Monitoring**: Monitor agent heartbeat; alert if missing for >5 minutes
4. **Capacity Planning**: Account for upload bandwidth during peak collection times

### Scale

1. **Load Testing**: Test agent deployment on 10, 100, 1000 devices to identify bottlenecks
2. **Database Tuning**: Index frequent queries (`GET /agents/{id}/jobs/next`)
3. **CDN/Proxy**: Use HTTP caching proxy to reduce backend load
4. **Evidence Storage**: Move `/vault/evidence` to high-IOPS storage (SSD) or S3-compatible bucket

### Compliance

1. **Audit Trails**: Agent actions are logged in chain-of-custody; verify retention policy
2. **Data Retention**: Set evidence retention policy in Admin Settings
3. **Encryption**: Enable full-disk encryption on agent machines to protect collected evidence in transit
4. **Consent**: Ensure proper authorization for agent deployment and evidence collection

---

## Advanced Configuration

### Custom Module Timeout

The agent respects `collection_timeout_min` in the job instruction from the backend:

```bash
# In Admin Settings, set "Max concurrent jobs" to adjust backend timeout
# Default: 60 minutes
```

### Concurrency Control

The agent respects `concurrency_limit` in the job instruction:

```bash
# In Admin Settings, set "Agent concurrency limit" to adjust parallel workers
# Default: 4 workers
```

### Evidence Working Directory

By default, the agent uses the OS temporary directory. For custom paths:

```bash
# Windows
set TEMP=D:\evidence-staging

# Linux
export TMPDIR=/mnt/evidence-staging
```

---

## Support and Reporting Issues

### Gather Diagnostic Information

Before reporting issues, collect:

1. Agent logs (Windows: Event Viewer; Linux: `journalctl -u dfir-agent`)
2. Network connectivity test (`curl -v http://backend:8000/api/v1/status/health`)
3. Agent environment variables (`set | grep DFIR` on Windows; `env | grep DFIR` on Linux)
4. Backend logs (`docker compose logs backend`)
5. Database connectivity test (`psql -U dfir -d dfir -h localhost`)

### Debug Mode

Enable verbose logging (if implemented):

```bash
export DFIR_LOG_LEVEL=debug
./dfir-agent
```

---

## Next Steps

1. **Start with one test device** — Verify configuration and collection flow
2. **Scale gradually** — Deploy to 5, 10, then 100 devices
3. **Customize modules** — Adjust collection profiles for your environment
4. **Integrate with SIEM** — Forward processing results to your SIEM
5. **Tune performance** — Monitor agent and backend metrics, adjust concurrency and timeouts
