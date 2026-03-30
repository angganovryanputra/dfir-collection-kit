# Getting Started — DFIR Rapid Collection Kit

This guide covers everything from first deployment to running your first collection.

---

## Prerequisites

### Docker Deployment (Recommended)

| Requirement | Minimum |
|-------------|---------|
| Docker Engine | 20.10+ |
| Docker Compose | v2.0+ |
| RAM | 4 GB |
| Disk | 10 GB free |

### Local Development

| Requirement | Version |
|-------------|---------|
| Python | 3.12+ |
| Node.js | 20+ |
| Go | 1.23+ (agent only) |
| PostgreSQL | 16+ |
| Redis | 7+ |

---

## Docker Quick Start

### Step 1 — Clone

```bash
git clone <repository-url>
cd dfir-collection-kit
```

### Step 2 — Create `.env` from Template

```bash
cp .env.example .env
```

Open `.env` and set at minimum these three required values:

```bash
# JWT signing key — required, backend refuses to start without it
SECRET_KEY=<generate-below>

# Agent shared secret — must match agent AGENT_SHARED_SECRET env var
AGENT_SHARED_SECRET=<generate-below>

# Admin account password (default: admin123!)
DFIR_DEFAULT_ADMIN_PASSWORD=admin123!
```

**Generate secrets:**
```bash
python3 -c "import secrets; print(secrets.token_urlsafe(32))"
# Run twice — once for SECRET_KEY, once for AGENT_SHARED_SECRET
```

### Step 3 — Build and Start

```bash
docker compose up --build
```

Wait for all services to report healthy. You should see:
```
db          | database system is ready to accept connections
redis       | Ready to accept connections
backend     | Application startup complete
frontend    | (nginx is running silently — check with curl http://localhost:5173)
```

The database is initialized and seeded automatically on first launch.

### Step 4 — Open the Application

| Service | URL |
|---------|-----|
| **Frontend** | http://localhost:5173 |
| **Backend API** | http://localhost:8000 |
| **Interactive API Docs** | http://localhost:8000/docs |

### Step 5 — Login

```
Username: admin
Password: admin123!
```

_(or whatever you set in `DFIR_DEFAULT_ADMIN_PASSWORD`)_

**Change the admin password immediately after first login.** This account has full administrative access. Create separate `operator` and `viewer` accounts for your team from **Admin → Users**.

---

## Services Overview

`docker compose up` starts five services:

| Service | Role | Port |
|---------|------|------|
| `db` | PostgreSQL 16 — case and evidence metadata | 5432 |
| `redis` | Redis 7 — Celery message broker | 6379 |
| `backend` | FastAPI REST API | 8000 |
| `celery_worker` | Background forensics pipeline (EZTools, Hayabusa, Chainsaw) | — |
| `frontend` | React UI served by Nginx | 5173 |

Evidence files are stored in the Docker volume `dfir_evidence` (mounted at `/vault/evidence` in the backend and Celery containers). The database persists in `dfir_postgres`.

---

## Local Development Setup

For development without the full Docker stack.

### Backend

```bash
cd backend

# Create and activate virtual environment
python3 -m venv .venv
source .venv/bin/activate          # macOS/Linux
# .venv\Scripts\Activate.ps1       # Windows (PowerShell)

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env: set DATABASE_URL, SECRET_KEY, AGENT_SHARED_SECRET, EVIDENCE_STORAGE_PATH

# Start a local PostgreSQL (Docker is the easiest way)
docker run -d --name dfir-db \
  -e POSTGRES_USER=dfir -e POSTGRES_PASSWORD=dfir -e POSTGRES_DB=dfir \
  -p 5432:5432 postgres:16

# Apply migrations (always before first run or after pulling new migrations)
alembic upgrade head

# Seed initial admin account and default templates
python -m app.seed_run

# Start development server (auto-reload)
uvicorn app.main:app --reload --port 8000
```

Backend is available at http://localhost:8000. API docs at http://localhost:8000/docs.

> **Important:** Always run `alembic upgrade head` before `python -m app.seed_run`. Migrations create the schema; seed_run only adds data.

### Frontend

```bash
cd frontend

npm install

# Configure API URL
cp .env.example .env
# Set: VITE_API_BASE_URL=http://localhost:8000/api/v1

npm run dev    # Dev server at http://localhost:5173
```

### Go Agent (Optional for Local Dev)

```bash
cd agent

# Build for current platform
go build -o dfir-agent ./cmd/agent/

# Run with env vars (all agent vars use DFIR_ prefix)
DFIR_BACKEND_URL=http://localhost:8000 \
DFIR_AGENT_SECRET=your-secret \
DFIR_AGENT_ID=DEV-WORKSTATION \
./dfir-agent
```

---

## Environment Variables Reference

All variables can be set in the root `.env` file (Docker) or `backend/.env` (local dev).

### Required

| Variable | Description |
|----------|-------------|
| `SECRET_KEY` | JWT signing key. Backend refuses to start if weak or missing. |
| `AGENT_SHARED_SECRET` | Agent authentication token. Must match agent config. |
| `DATABASE_URL` | Async PostgreSQL URL: `postgresql+asyncpg://user:pass@host/db` |

### Important

| Variable | Default | Description |
|----------|---------|-------------|
| `DFIR_DEFAULT_ADMIN_PASSWORD` | `admin123!` | Admin password set on first seed |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `60` | JWT session duration in minutes |
| `EVIDENCE_STORAGE_PATH` | `/vault/evidence` | Where evidence ZIPs are stored |
| `REQUIRE_AUTH` | `true` | Set `false` only for local loopback testing |
| `ALLOWED_ORIGINS` | `http://localhost:5173` | CORS whitelist for frontend origin(s) |

### Forensics Pipeline

| Variable | Default | Description |
|----------|---------|-------------|
| `EZTOOLS_DIR` | `/opt/eztools` | Directory containing EZTools binaries |
| `HAYABUSA_PATH` | `/opt/hayabusa/hayabusa` | Hayabusa binary path |
| `CHAINSAW_PATH` | `/opt/chainsaw/chainsaw` | Chainsaw binary path |
| `SIGMA_RULES_DIR` | `/opt/chainsaw/rules/` | Sigma rules directory for Chainsaw |

Forensics tools are **not required** to run the platform — they are only needed for the background pipeline. Without them, collection and evidence storage still work; only automated parsing is unavailable.

---

## First Incident: Step-by-Step

### 1. Register an Agent

Before running a collection, register the Go agent on the target endpoint:

1. Build the agent binary for the target OS (see Agent Deployment in README)
2. Run the agent with `BACKEND_URL`, `AGENT_SHARED_SECRET`, and `AGENT_ID` set
3. The agent self-registers on first launch — confirm in **Devices** page

### 2. Create an Incident

1. Click **Create Incident** in the sidebar
2. Fill in:
   - **Type**: Ransomware, Account Compromise, Data Exfiltration, Insider Threat, etc.
   - **Target Endpoints**: Hostnames or IPs (comma-separated)
   - **Operator**: Your name or badge ID
3. Optionally select an **Incident Template** to pre-fill checklists and defaults
4. Click **Create Incident**

### 3. Configure Collection Modules

On the Collection Setup page:

- **Select a Profile**: `triage` (fastest), `ransomware`, `insider_threat`, or `full`
- **Or select modules manually** by category (volatile, logs, persistence, artifacts, system)
- The OS is auto-detected from the registered device; you can override it

Click **Start Collection** when ready.

### 4. Monitor Collection

The Collection Execution page shows real-time logs from the agent. The agent:
1. Polls for the job instruction (with OPSEC jitter)
2. Executes modules in parallel (default: 4 concurrent)
3. Creates a ZIP and uploads to the backend
4. Backend extracts, hashes, appends chain-of-custody, and locks the folder

Collection status updates automatically every ~1.2 seconds.

### 5. Run the Forensics Pipeline

After collection completes:
- **Auto**: If `auto_process = true` in System Settings, the pipeline triggers automatically
- **Manual**: Navigate to **Processing** for the incident and click **Trigger Pipeline**

Monitor pipeline phases:
1. `parsing` — EZTools parsing EVTX, registry, prefetch, etc.
2. `sigma` — Hayabusa + Chainsaw threat hunting
3. `timeline` — CSV merge and DuckDB indexing

### 6. Analyze Results

Once the pipeline completes:

| Page | What You Find |
|------|---------------|
| **Sigma Hits** | Sigma rule detections sorted by severity (critical → informational) |
| **IOC Matches** | Timeline events matching known-bad IPs, domains, hashes |
| **YARA Matches** | Files matching YARA rules |
| **Attack Chains** | MITRE ATT&CK techniques correlated into kill chains |
| **Evidence Vault** | Raw collected files; download individual artifacts or full ZIP export |
| **Chain of Custody** | Cryptographically verified event log; export as CSV |

### 7. Generate Report & Close

1. Click **Generate HTML Report** on the Processing page — produces a self-contained HTML report
2. When the investigation concludes, set incident status to **CLOSED**
3. Closed incidents are immutable — no further collection or updates

---

## Admin Configuration

The **Admin → System Settings** page (`/admin/settings`) controls:

| Setting | Description |
|---------|-------------|
| Evidence storage path | Where files are stored on the server filesystem |
| Max file size (GB) | Upload limit per evidence ZIP |
| Hash algorithm | SHA-256 (default) |
| Session timeout (min) | JWT expiry for UI sessions |
| Max failed logins | Account lockout threshold |
| Log retention (days) | Audit log retention period |
| Max concurrent jobs | System-wide job concurrency cap |
| Agent concurrency limit | Modules to run in parallel per agent job |
| Auto process | Trigger pipeline automatically after evidence upload |
| Tool paths | Paths to EZTools, Hayabusa, Chainsaw, Sigma rules, YARA rules |
| Timesketch | Optional Timesketch integration URL and API token |

After changing settings, click **Save**. Changes take effect within 60 seconds (runtime cache TTL).

Click **Verify Tools** to confirm that all forensics binaries exist at the configured paths.

---

## Database Migrations

Migrations are managed with Alembic. Always run migrations before starting the backend on a new installation or after pulling updates.

```bash
cd backend
alembic upgrade head
```

To create a new migration after modifying a model:

```bash
alembic revision --autogenerate -m "add new field"
# Review the generated file in alembic/versions/ before applying
alembic upgrade head
```

**Current migration chain:**
```
20260101_initial_schema
  → 20260117_add_incident_collection_state
    → 20260122_add_incident_template_id
      → 20260303_add_concurrency_limit
        → 20260401_processing_pipeline
          → 20260402_processing_settings
            → 20260403_phase2_analytics  ← current HEAD
```

> Do not use `python -m app.seed_run` to create tables in production — use Alembic migrations.

---

## Common Issues

### Backend refuses to start

```bash
docker compose logs backend | tail -30
```

**"SECRET_KEY matches a known weak default"** — Set a real random value in `.env`.

**"connection refused"** (database) — The backend retries 30 times with 2-second delays. If it still fails, check: `docker compose logs db`.

### Cannot log in (401)

1. Verify seed ran: `docker compose logs backend | grep -i seed`
2. Check you're using the correct password (default: `admin123!`)
3. If you changed `DFIR_DEFAULT_ADMIN_PASSWORD`, use that value instead
4. Clear browser localStorage and try again

### Login blocked (429)

More than 20 attempts from the same IP in 60 seconds triggers rate limiting. Wait 60 seconds before retrying.

### Pipeline not processing

```bash
docker compose ps          # Verify celery_worker is running
docker compose logs celery_worker | tail -30
```

If tools are not found, configure their paths in **Admin → System Settings → Verify Tools**.

If `auto_process = false`, navigate to the incident's Processing page and click **Trigger Pipeline** manually.

### Evidence upload rejected (413)

The default upload limit is 10 GB. Increase `max_file_size_gb` in Admin Settings, or set `MAX_UPLOAD_SIZE_MB` in `.env`.

### Agent authentication fails (401)

Verify `AGENT_SHARED_SECRET` matches exactly between the backend and the agent:

```bash
docker compose exec backend env | grep AGENT_SHARED_SECRET
```

### Ports already in use

```bash
lsof -i :8000    # Backend
lsof -i :5173    # Frontend
lsof -i :5432    # PostgreSQL
lsof -i :6379    # Redis
```

Change the conflicting service port in `docker-compose.yml`.

---

## Useful Docker Commands

```bash
# Start services
docker compose up -d

# Rebuild and restart
docker compose up --build

# View logs
docker compose logs -f backend
docker compose logs -f celery_worker
docker compose logs -f frontend

# Check service health
docker compose ps

# Open a shell in backend
docker compose exec backend bash

# Apply migrations inside container
docker compose exec backend alembic upgrade head

# Re-seed (only if no users exist)
docker compose exec backend python -m app.seed_run

# Stop everything
docker compose down

# Stop and remove volumes (DESTROYS ALL DATA)
docker compose down -v
```

---

## Backup and Recovery

### Backup

```bash
# Backup database
docker compose exec db pg_dump -U dfir dfir > backup_$(date +%Y%m%d).sql

# Backup evidence files
docker run --rm -v dfir_evidence:/data -v $(pwd):/backup alpine \
  tar czf /backup/evidence_$(date +%Y%m%d).tar.gz /data
```

### Restore

```bash
# Restore database
docker compose exec -T db psql -U dfir dfir < backup_20260322.sql

# Restore evidence files
docker run --rm -v dfir_evidence:/data -v $(pwd):/backup alpine \
  tar xzf /backup/evidence_20260322.tar.gz -C /
```

---

## Next Steps

### For Operators

1. **Create your team accounts** — Admin → Users → Create User (role: operator or viewer)
2. **Set up Incident Templates** — pre-fill checklists for your common incident types
3. **Configure tool paths** — Admin → System Settings → Verify Tools (for automated parsing)
4. **Enable auto_process** — if you want the pipeline to trigger automatically after each collection

### For Developers

1. **Read the architecture** — `docs/ARCHITECTURE.md`
2. **Read the audit report** — `AUDIT_REPORT.md` for known issues and decisions
3. **Run tests** — `DFIR_TEST_DATABASE_URL=... pytest` in backend directory
4. **API documentation** — http://localhost:8000/docs (interactive, auto-generated)

### For Security Teams

1. **Change default password** immediately after first login
2. **Set `ALLOWED_ORIGINS`** to your actual frontend domain in production
3. **Configure log retention** in Admin Settings to match your policy
4. **Review security notes** in `README.md` before internet-facing deployment
