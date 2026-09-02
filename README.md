# DFIR Rapid Collection Kit

**Evidence Collection and Management System for Digital Forensics & Incident Response**

![CI](https://github.com/angganovryanputra/dfir-collection-kit/workflows/CI%20Pipeline/badge.svg)
![CD](https://github.com/angganovryanputra/dfir-collection-kit/workflows/CD%20Pipeline/badge.svg)
![CodeQL](https://github.com/angganovryanputra/dfir-collection-kit/workflows/CodeQL/badge.svg)

---

## Overview

DFIR Rapid Collection Kit is a secure, web-based platform for managing incident response operations and collecting digital evidence at scale. It provides a complete end-to-end workflow: incident creation → automated evidence collection via Go agents → forensics pipeline → threat hunting → chain-of-custody reporting.

Built for DFIR practitioners who need a single platform to coordinate collections across multiple endpoints, maintain forensic integrity, and run automated analytics without manual scripting.

---

## Features

| Feature | Description |
|---------|-------------|
| **Incident Management** | Create, track, and manage DFIR cases with status machine (PENDING → ACTIVE → COLLECTION_IN_PROGRESS → COMPLETE → CLOSED) |
| **Evidence Collection** | Automated collection via Go-based agents; 40+ Windows modules, 11+ Linux modules across 5 categories |
| **Collection Profiles** | Pre-built profiles: `triage`, `ransomware`, `insider_threat`, `full` — or select modules manually |
| **Agent Local Parsing** | On-device parsing (EVTX → JSONL, Prefetch → CSV, LNK → CSV, Browser History → CSV) before upload, reducing data transfer and enabling offline collection |
| **Chain of Custody** | Tamper-evident, cryptographically hash-chained audit trail — verified on every read |
| **Evidence Vault** | SHA256-hashed evidence with immutable LOCKED state; export as ZIP with HMAC-SHA256 signature |
| **Forensics Pipeline** | Background Celery workers: 8 EZTools parsers → Hayabusa + Chainsaw Sigma hunting → DuckDB super timeline |
| **Threat Hunting UI** | Sigma hits, YARA matches, IOC indicators, MITRE ATT&CK kill chain visualization |
| **Timeline Explorer** | DuckDB-powered full-text search across merged super timeline with date range, source filter, and CSV/JSONL export |
| **Incident Hub** | Per-incident command center: metadata, quick-action grid, analysis progress, lateral movement summary |
| **Template System** | Reusable incident templates with preflight checklists and default endpoint sets |
| **Role-Based Access** | Three roles: `admin` > `operator` > `viewer` with fine-grained endpoint enforcement |
| **Audit Log** | Hash-chained system event log with filtering by event type, actor, target, time range |
| **Docker Ready** | Single-command deployment; Redis + Celery included for background pipeline tasks |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      User Browser                           │
│               React 18 + TypeScript (Vite)                  │
│         Port 5173  ·  Served by Nginx (SPA)                 │
└────────────────────────────┬────────────────────────────────┘
                             │ REST API (JWT Bearer)
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                  Backend (FastAPI)  :8000                    │
│         async SQLAlchemy · RBAC · Rate Limiting              │
│         Security Headers · Audit Logging                     │
└──────┬────────────┬──────────────────┬──────────────────────┘
       │            │                  │
       ▼            ▼                  ▼
┌────────────┐ ┌──────────┐  ┌────────────────────────┐
│ PostgreSQL │ │  Redis   │  │  Evidence Storage      │
│   :5432    │ │  :6379   │  │  /vault/evidence       │
└────────────┘ └──────────┘  └────────────────────────┘
                    │                  ▲
                    ▼                  │
         ┌──────────────────┐  ┌───────────────────────┐
         │  Celery Worker   │  │  Forensics Tools      │
         │  (Background)    │→ │  EZTools / Hayabusa   │
         │  Parsing Pipeline│  │  Chainsaw / DuckDB    │
         └──────────────────┘  └───────────────────────┘
                                        ▲
                              ┌─────────┴──────────────┐
                              │    Go Agents (OPSEC)   │
                              │ Poll jobs with jitter  │
                              │ X-Agent-Token auth     │
                              │ Upload evidence ZIPs   │
                              └────────────────────────┘
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui, TanStack Query v5 |
| Backend | FastAPI (Python 3.12), SQLAlchemy 2.0 async, Alembic, Pydantic v2 |
| Database | PostgreSQL 16, Redis 7 (Celery broker) |
| Background Tasks | Celery (forensics pipeline worker) |
| Agent | Go 1.23 (goroutine pool, concurrent module execution, local parsing) |
| Forensics | EZTools (8 parsers), Hayabusa, Chainsaw, DuckDB |
| Serving | Nginx (SPA + security headers, production-ready) |

---

## Forensics Pipeline

The built-in pipeline automates the full chain from raw artifact to interactive hunting.

```
Agent Upload → Celery Worker → EZTools Parse → Sigma Hunt → Timeline Merge → DuckDB
```

### Pipeline Stages

1. **Evidence Upload** — Go agent collects artifacts, zips them, uploads to `/agents/{id}/jobs/{id}/upload`
2. **Extraction & Hashing** — Backend extracts ZIP, SHA256 hashes every file, writes `hashes.sha256` manifest, appends chain-of-custody, locks folder
3. **EZTools Parsing** — 8 parsers run in parallel (Celery):
   - `EvtxECmd` — Windows Event Logs (`.evtx`)
   - `MFTECmd` — MFT, `$UsnJrnl`, `$LogFile`
   - `RECmd` — Registry hives (SYSTEM, SAM, SOFTWARE, NTUSER.DAT)
   - `PECmd` — Prefetch files (`.pf`)
   - `LECmd` — LNK shortcut files
   - `JLECmd` — Jump Lists
   - `AppCompatCacheParser` — ShimCache
   - `AmcacheParser` — Amcache.hve
4. **Sigma Threat Hunting** — Hayabusa and Chainsaw scan EVTX files against Sigma rules
5. **Timeline Merge** — All CSVs normalized to a common schema and merged into DuckDB
6. **DuckDB Indexing** — Timeline loaded into DuckDB store for fast full-text search
7. **Analytics** — YARA file matching, IOC correlation, MITRE ATT&CK kill chain reconstruction

### Super Timeline Schema

| Column | Description |
|--------|-------------|
| `datetime` | UTC timestamp |
| `source` | Log channel / hive path / rule filename |
| `computer` | Hostname |
| `event_id` | Windows Event ID |
| `description` | Primary message / file path |
| `details` | Extended payload |
| `rule_title` | Sigma rule name (alerts only) |
| `sigma_level` | Alert severity (critical/high/medium/low) |
| `user` | Associated user account |
| `original_file` | Source CSV filename for traceability |

---

## Collection Modules

Modules are organized into 5 categories and registered in `backend/app/core/modules.py`. Go implementations live in `agent/internal/modules/*.go`.

### Windows Modules (40+)

| Category | Modules |
|----------|---------|
| **volatile** | `process_list`, `network_connections`, `listening_ports`, `dns_cache`, `logged_on_users` |
| **logs** | `eventlog_security`, `eventlog_system`, `eventlog_application`, `eventlog_powershell_operational`, `eventlog_sysmon_operational` |
| **persistence** | `scheduled_tasks`, `services`, `registry_run_keys`, `startup_folders`, `wmi_event_subscriptions` |
| **artifacts** | `registry_hives`, `ntuser_dat`, `prefetch`, `amcache`, `shimcache`, `lnk_files`, `jump_lists`, `browser_chrome`, `browser_edge`, `bits_jobs`, `recycle_bin`, `thumbcache`, `shellbags`, `mru`, `usb_history` |
| **system** | `local_users`, `system_info`, `installed_patches`, `timezone`, `boot_time` |

Volume Shadow Copy modules: `mft_vss`, `usnjrnl_vss`

### Linux Modules (11+)

| Category | Modules |
|----------|---------|
| **volatile** | `process_list`, `network_connections` |
| **logs** | `journalctl`, `syslog`, `auth_logs`, `wtmp`, `btmp` |
| **persistence** | `cron`, `systemd_units`, `systemd_timers`, `rc_local`, `authorized_keys` |
| **system** | `ip_config`, `resolv_conf`, `bash_history`, `logged_in_users`, `installed_packages`, `kernel_version` |

> **macOS**: Module metadata is registered in Python (`MODULE_REGISTRY`) but Go implementations do not yet exist. macOS collection is not functional.

### Collection Profiles

| Profile | Description | Speed |
|---------|-------------|-------|
| `triage` | Volatile data + key logs + basic system info | Fastest |
| `ransomware` | Event logs + persistence + artifacts (malware-focused) | Medium |
| `insider_threat` | User activity + persistence + browser + artifacts | Medium |
| `full` | All modules on target platform | Slowest / most complete |

---

## Role-Based Access Control

| Role | Capabilities |
|------|-------------|
| **admin** | Full access: user management, system settings, delete incidents/templates, audit logs |
| **operator** | Create/update incidents, start collections, manage templates, create jobs |
| **viewer** | Read-only: view incidents, evidence, chain-of-custody, processing results |

Roles are enforced server-side via `require_roles()` dependency on every protected endpoint. The admin account created at first launch can create additional users from the **Admin > Users** page.

---

## Quick Start (Docker)

### Prerequisites

- Docker Engine 20.10+
- Docker Compose v2.0+
- 4 GB RAM minimum
- 10 GB free disk space

### One-Command Setup (Recommended)

```bash
git clone <repository-url>
cd dfir-collection-kit
make setup
```

This single command:
1. Generates cryptographically secure secrets and stores them in `.env`
2. Generates a self-signed TLS certificate
3. Starts all services (`docker compose up -d --build`)
4. Waits for services to be healthy
5. Applies database migrations
6. Seeds the default admin account with a random password

After setup completes, the admin password will be printed to the terminal. The password is also saved in `.env` as `DFIR_DEFAULT_ADMIN_PASSWORD`.

**Access the application:**

| Service | URL |
|---------|-----|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:8000 |
| Interactive API Docs | http://localhost:8000/docs |

---

## Manual Setup (Fallback)

If you prefer to set up step-by-step instead of using `make setup`:

### Step 1 — Clone

```bash
git clone <repository-url>
cd dfir-collection-kit
```

### Step 2 — Create `.env` File

```bash
cp .env.example .env
```

Edit `.env` and set these three required values:

```bash
# JWT signing key — required, startup fails without it
SECRET_KEY=$(python3 -c "import secrets; print(secrets.token_urlsafe(32))")

# Agent authentication — must match agent DFIR_AGENT_SECRET env var
AGENT_SHARED_SECRET=$(python3 -c "import secrets; print(secrets.token_urlsafe(32))")

# Admin password — auto-generated by make setup, or set manually here
DFIR_DEFAULT_ADMIN_PASSWORD=<secure-password>
```

### Step 3 — Start

```bash
docker compose up --build
```

Services that start:
- `db` — PostgreSQL 16 (port 5432)
- `redis` — Redis 7 (port 6379, Celery broker)
- `backend` — FastAPI REST API (port 8000)
- `celery_worker` — Background forensics pipeline
- `frontend` — React UI served by Nginx (port 5173)

Database is initialized and seeded automatically on first launch.

### Step 4 — Default Credentials

Only one account is seeded on first launch:

| Field | Value |
|-------|-------|
| Username | `admin` |
| Password | Value of `DFIR_DEFAULT_ADMIN_PASSWORD` from `.env` |

**Change the default password immediately after first login.** Create additional `operator` and `viewer` accounts from **Admin → Users**.

---

## Security

### Critical Settings

| Setting | Risk if Not Set | How to Generate |
|---------|----------------|-----------------|
| `SECRET_KEY` | JWT tokens forgeable | `python3 -c "import secrets; print(secrets.token_urlsafe(32))"` |
| `AGENT_SHARED_SECRET` | Agents unauthenticated | `python3 -c "import secrets; print(secrets.token_urlsafe(32))"` |
| `DFIR_DEFAULT_ADMIN_PASSWORD` | Default `admin123!` exposed (if manually set to that value) | Generate a random password, or use `make setup` for auto-generation |

The backend **refuses to start** if `SECRET_KEY` matches any known weak default (`change-me`, `local-dev-secret`, etc.). It also requires `AGENT_SHARED_SECRET` to be non-empty.

### Evidence Integrity

- SHA256 manifest (`hashes.sha256`) written after every upload
- LOCKED marker file prevents post-collection modification
- Chain-of-custody entries are cryptographically hash-chained (SHA256 of all fields + previous hash)
- Full chain integrity verified on every `GET /chain-of-custody` request — returns 409 if tampered
- Export ZIPs signed with HMAC-SHA256 (keyed by `SECRET_KEY`)

### Hardening Applied

- Docker containers run as non-root (`dfir` UID 1000), `no-new-privileges:true`, `cap_drop: ALL`
- Security headers on all responses (X-Content-Type-Options, X-Frame-Options, X-XSS-Protection, Referrer-Policy, X-Permitted-Cross-Domain-Policies, Permissions-Policy, Content-Security-Policy)
- CORS restricted to explicit methods and header whitelist (no wildcards)
- Empty `AGENT_SHARED_SECRET` causes startup RuntimeError (same as weak `SECRET_KEY`)
- In-memory sliding window rate limiter on `/auth/login` — 20 attempts per IP per 60 seconds
- Agent token comparison via `hmac.compare_digest` (timing-attack resistant)
- Path traversal prevention via `safe_join()` + ID validation regex on all file paths
- `timesketch_token` masked as `***` in all API responses

### Data Persistence

```
dfir_postgres:/var/lib/postgresql/data   # Database
dfir_evidence:/vault/evidence            # Evidence files
```

Back up these two volumes regularly. Evidence cannot be recovered from the database alone.

---

## API Reference

### Authentication

All endpoints except `/auth/login`, `/status/health`, and agent registration require a JWT Bearer token:

```http
Authorization: Bearer <token>
```

Tokens expire after `ACCESS_TOKEN_EXPIRE_MINUTES` (default: 60 minutes). The login response includes `expires_at` for proactive refresh.

Agent endpoints use a separate header:

```http
X-Agent-Token: <AGENT_SHARED_SECRET>
```

### Endpoint Summary

| Group | Base Path | Key Routes |
|-------|-----------|------------|
| **Auth** | `/api/v1/auth` | `POST /login`, `POST /logout` |
| **Incidents** | `/api/v1/incidents` | CRUD + `POST /{id}/collect`, `POST /{id}/collect/poll`, `GET /{id}/report` |
| **Devices** | `/api/v1/devices` | CRUD |
| **Agents** | `/api/v1/agents` | `POST /register`, `GET /{id}/jobs/next` (long-poll), `POST /{id}/jobs/{jid}/upload` |
| **Jobs** | `/api/v1/jobs` | `POST /`, `GET /{id}`, `POST /{id}/cancel` |
| **Evidence** | `/api/v1/evidence` | `GET /folders`, `GET /items`, `GET /{fid}/items/{iid}/download`, `POST /{inc_id}/export`, `GET /super-timeline/{inc_id}` (query), `GET /super-timeline/{inc_id}/export` (CSV/JSONL) |
| **Chain of Custody** | `/api/v1/chain-of-custody` | `GET /` (verified), `GET /export` (CSV) |
| **Modules** | `/api/v1/modules` | `GET /?os=`, `GET /profiles`, `GET /profiles/{id}?os=` |
| **Processing** | `/api/v1/processing` | `POST /trigger`, `GET /incident/{id}/status`, `/sigma-hits`, `/yara-matches`, `/ioc-matches`, `/attack-chains` |
| **Templates** | `/api/v1/templates` | CRUD + `POST /{id}/use` |
| **Users** | `/api/v1/users` | CRUD (admin), `GET /me` |
| **Collectors** | `/api/v1/collectors` | CRUD |
| **Settings** | `/api/v1/settings` | `GET /`, `PUT /`, `POST /verify-tools` |
| **Audit Logs** | `/api/v1/audit-logs` | `GET /` (filterable) |
| **Status** | `/api/v1/status` | `GET /health` (public), `GET /diagnostics` (admin+) |

Full interactive documentation: **http://localhost:8000/docs**

---

## Workflows

### Incident Response Workflow

```
1. Create Incident  →  2. Select Modules  →  3. Agent Collects  →  4. Pipeline Runs  →  5. Analyze
```

**1. Create Incident**
- Navigate to **Dashboard → Create Incident**
- Select incident type (Ransomware, Account Compromise, Data Exfiltration, etc.)
- Add target endpoint hostnames
- Optionally apply an Incident Template for pre-filled checklists

**2. Select Modules / Profile**
- On the Collection Setup page, choose a profile (`triage` for speed, `full` for comprehensive)
- Or manually select individual modules by category (volatile, logs, persistence, artifacts, system)
- OS is auto-detected from the registered device; override if needed

**3. Agent Collects (Three Phases)**

The agent executes in three distinct phases:

**Phase 1 — Artifact Collection**: Agent polls for the job instruction (with OPSEC jitter), then executes all selected modules in parallel (default: 4 concurrent goroutines). Status updates to backend show progress: `"collecting"` or `"collecting (5/10)"`.

**Phase 2 — Local Parsing**: After artifact collection completes, the agent's local parsers run on the workdir. These parse collected artifacts to more useful formats (EVTX → JSONL via wevtutil, Prefetch/LNK → CSV via binary parsers, Browser History → CSV). Status updates show `"parsing"`.

**Phase 3 — ZIP + Upload**: Agent packs the workdir (including all parsed outputs) into `collection.zip` and uploads to backend. Backend extracts, hashes, appends chain-of-custody, and locks the folder. Status updates show `"uploading"` then `"complete"`.

**4. Forensics Pipeline**
- If `auto_process = true` in Admin Settings: pipeline triggers automatically on upload
- Otherwise: manually trigger from the **Processing** page
- Monitor pipeline status: EZTools Parsing → Sigma Hunt → Timeline Merge → DuckDB Indexing

**5. Analyze**
- **Timeline Explorer**: Full-text search across super timeline with DuckDB
- **Sigma Hits**: Browse detections by severity (critical/high/medium/low/informational)
- **IOC Matches**: See which timeline events matched known-bad indicators
- **YARA Matches**: File-level detections from YARA rule scanning
- **Attack Chains**: MITRE ATT&CK kill chain visualization from correlated events
- **Incident Hub**: Central command center with analysis progress and lateral movement summary
- **Generate Report**: HTML incident report with full chain-of-custody

**6. Close Incident**
- Update status to `CLOSED` from the incident detail page
- Closed incidents are immutable — no further collections or updates allowed
- Export chain-of-custody as CSV for legal/compliance use

---

## Makefile Targets

The `Makefile` provides shortcuts for common operations:

### Setup & Lifecycle

```bash
make setup              # First-time setup: secrets, services, migrations, seed
make up                 # Start all services in background
make down               # Stop all services
make restart            # Restart all services
make rebuild            # Rebuild and restart (after code changes)
make logs               # Tail logs from all services
make logs-backend       # Tail backend + celery logs only
make status             # Show service health and port bindings
```

### Database

```bash
make migrate            # Apply pending Alembic migrations
make seed               # Seed default users (idempotent)
make seed-demo          # Seed demo incidents, devices, and timeline data
make backup-db          # Dump PostgreSQL database to backups/
```

### Agent Build

```bash
make agent-windows      # Build Windows (amd64) agent → agent/dist/dfir-agent.exe
make agent-linux        # Build Linux (amd64) agent → agent/dist/dfir-agent-linux
make agent-linux-arm64  # Build Linux ARM64 agent → agent/dist/dfir-agent-linux-arm64
make agent-all          # Build all three platforms
make agent-config       # Show agent env config based on current .env
```

### Testing & Development

```bash
make test-backend       # Run backend test suite in container
make shell-backend      # Open bash shell in backend container
```

### Destruction

```bash
make reset              # Stop services, remove containers (keeps data)
make reset-volumes      # DESTRUCTIVE: remove containers AND volumes (deletes all data)
```

---

## Agent Deployment

For a comprehensive agent deployment guide, see `docs/AGENT_DEPLOYMENT.md`. Quick reference:

### Building the Agent

```bash
# Using Makefile (recommended)
make agent-windows      # Windows amd64
make agent-linux        # Linux amd64
make agent-all          # Both

# Manual cross-compilation
cd agent
GOOS=windows GOARCH=amd64 go build -o dfir-agent.exe ./cmd/agent/
GOOS=linux GOARCH=amd64 go build -o dfir-agent-linux ./cmd/agent/
```

Binaries are placed in `agent/dist/`.

### Agent Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DFIR_BACKEND_URL` | Yes | Backend API base URL (e.g., `http://10.0.0.1:8000/api/v1`) |
| `DFIR_AGENT_SECRET` | Yes | Must match backend `AGENT_SHARED_SECRET` |
| `DFIR_AGENT_ID` | No | Unique identifier for this agent; auto-generated and persisted to `~/.dfir-agent/agent_id.json` if not set |
| `DFIR_HOSTNAME` | No | Override reported hostname |
| `DFIR_IP_ADDRESS` | No | Override reported IP address |
| `DFIR_TYPE` | No | Device type label |

### Example Deployment

```bash
export DFIR_BACKEND_URL="http://dfir-server:8000/api/v1"
export DFIR_AGENT_SECRET="your-shared-secret"
./dfir-agent
```

The agent registers itself on first run, then enters the job polling loop. View agent progress from the **Devices** page in the UI.

### Dry-Run Mode

Test collection locally without a backend:

```bash
./dfir-agent --dry-run
```

---

## Development

### Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # Edit with local values

# Apply migrations (required before first run)
alembic upgrade head

# Seed initial data
python -m app.seed_run

# Run development server
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
cp .env.example .env   # Set VITE_API_BASE_URL=http://localhost:8000/api/v1
npm run dev            # Dev server at :5173
npm run build          # Production build
npm run lint           # ESLint
```

### Agent (Go)

```bash
cd agent
go build ./cmd/agent/...
go test ./...
```

### Running Tests

```bash
cd backend
# Requires a test PostgreSQL database
DFIR_TEST_DATABASE_URL=postgresql+asyncpg://dfir:dfir@localhost:5432/dfir_test pytest
pytest tests/test_rbac_audit.py   # Single test file
```

Tests skip automatically if `DFIR_TEST_DATABASE_URL` is not set.

### Database Migrations

```bash
cd backend
alembic upgrade head                                   # Apply all migrations
alembic revision --autogenerate -m "description"       # Generate new migration
```

**Migration chain** (in order):
`20260101_initial_schema` → `20260117_add_incident_collection_state` → `20260122_add_incident_template_id` → `20260303_add_concurrency_limit` → `20260401_processing_pipeline` → `20260402_processing_settings` → `20260403_phase2_analytics` → `20260501_super_timeline`

### Code Style

```bash
cd backend
black --check .     # Formatter (line length 100)
isort --check .     # Import sorter (profile=black)
```

---

## Troubleshooting

### Backend fails to start

```bash
docker compose logs backend
```

Common causes:
- `SECRET_KEY` not set or is a known weak value
- Database not yet ready (backend retries 30× with 2s delay automatically)
- Missing `AGENT_SHARED_SECRET`

### Cannot log in

- Verify the database seeded correctly: `docker compose logs backend | grep seed`
- Check the password in `.env` (`DFIR_DEFAULT_ADMIN_PASSWORD`)
- Check for rate limiting: more than 20 login attempts in 60s from the same IP returns 429

### Agent cannot connect

```bash
docker compose exec backend env | grep AGENT_SHARED_SECRET
```

Ensure the agent's `DFIR_AGENT_SECRET` matches the backend `AGENT_SHARED_SECRET` exactly. The agent must also be able to reach `DFIR_BACKEND_URL` on port 8000 (or whatever port you configured).

### Pipeline not running

1. Verify Redis is healthy: `docker compose ps redis`
2. Verify Celery worker started: `docker compose logs celery_worker`
3. Check tool paths in **Admin → System Settings → Verify Tools**
4. If `auto_process = false`, trigger manually from the Processing page

### Evidence upload fails (413)

Increase `max_file_size_gb` in Admin Settings or set `MAX_UPLOAD_SIZE_MB` in `.env`.

### Ports already in use

```bash
# macOS/Linux
lsof -i :8000 && lsof -i :5173 && lsof -i :5432

# Windows
netstat -ano | findstr ":8000"
```

Change ports in `docker-compose.yml` if needed.

---

## License

MIT License
