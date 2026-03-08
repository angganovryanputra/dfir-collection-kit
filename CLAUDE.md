# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DFIR Rapid Collection Kit is a three-component system for digital forensics and incident response:
- **Backend**: FastAPI (Python 3.12) with async PostgreSQL
- **Frontend**: React 18 + TypeScript + Vite
- **Agent**: Go 1.23 (collection agent that runs on target endpoints)

## Development Commands

### Docker (primary workflow)
```bash
docker compose up --build       # Build and start all services
docker compose up -d            # Start in background
docker compose logs -f backend  # Tail backend logs
docker compose ps               # Check service health
```

### Backend (local dev)
```bash
cd backend
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env            # Then edit with local values
alembic upgrade head            # Apply migrations first
python -m app.seed_run          # Seed default users (idempotent)
uvicorn app.main:app --reload --port 8000
```

### Database migrations (Alembic)
```bash
cd backend
alembic upgrade head                                    # Apply all migrations
alembic revision --autogenerate -m "description"        # Create new migration
```

Migration chain: `20260101_initial_schema` → `20260117_add_incident_collection_state` → `20260122_add_incident_template_id` → `20260303_add_concurrency_limit` → `20260401_processing_pipeline` → `20260402_processing_settings` → `20260403_phase2_analytics`. When adding a new migration, set `down_revision` to the last entry in this chain.

`app/seed.py` contains the seeding logic. `app/seed_run.py` calls `create_all` (no-op if tables exist) then runs seed. Do not use `seed_run.py` to create tables in production — use Alembic.

### Backend tests
```bash
cd backend
DFIR_TEST_DATABASE_URL=postgresql+asyncpg://dfir:dfir@localhost:5432/dfir_test pytest
pytest tests/test_rbac_audit.py  # Run a single test file
```
Tests skip automatically if `DFIR_TEST_DATABASE_URL` is not set. The test DB schema is created/dropped automatically per session.

### Backend linting
```bash
cd backend
black --check .     # Line length 100
isort --check .     # profile=black
```

### Frontend
```bash
cd frontend
npm install
npm run dev         # Dev server on :5173
npm run build       # Production build
npm run lint        # ESLint
```

### Agent (Go)
```bash
cd agent
go build ./cmd/agent/...
go test ./...
```

## Architecture

### Backend Layer Structure
```
app/api/v1/endpoints/   → HTTP handlers (thin, delegate to crud)
app/crud/               → All database operations (SQLAlchemy async)
app/models/             → SQLAlchemy ORM models
app/schemas/            → Pydantic request/response models
app/core/               → config, deps (FastAPI dependencies), security, evidence_files, modules
app/services/           → audit_log_service, system_settings_service
```

### Key Backend Patterns

**RBAC enforcement** uses a `require_roles()` dependency factory in `app/core/deps.py`:
```python
@router.delete("/{id}", dependencies=[Depends(require_roles("admin"))])
```
Three roles with decreasing permissions: `admin` > `operator` > `viewer`. `require_roles()` accepts multiple roles.

**Audit log** (`app/services/audit_log_service.py`) is separate from Chain of Custody. It uses the same tamper-evident hash chaining pattern but for system/API events. Use `safe_record_event()` when recording should not fail the request.

**Evidence pipeline**: Agent uploads a ZIP → backend extracts → SHA256 hashes all files → writes `hashes.sha256` manifest → appends `chain-of-custody.log` → creates DB records → writes `LOCKED` marker. The folder is then immutable.

**Chain of Custody integrity**: Each `ChainOfCustodyEntry` includes `sequence`, `previous_hash`, and `entry_hash` computed over all fields. `GET /api/v1/chain-of-custody` verifies the full chain on read and returns 409 if corrupted.

**Security hardening** (`app/main.py`):
- `_INSECURE_DEFAULTS` check — RuntimeError at startup if `SECRET_KEY` is a known weak value
- `SecurityHeadersMiddleware` — adds X-Content-Type-Options, X-Frame-Options, X-XSS-Protection, Referrer-Policy on every response
- In-memory sliding window IP rate limiter on `POST /auth/login` (20 attempts/60s, returns 429 + Retry-After)

### Module System

**Python registry** (`app/core/modules.py`): `MODULE_REGISTRY` maps module IDs to metadata (`category`, `priority`, `os`, `output_relpath`). Categories: `volatile`, `logs`, `persistence`, `system`, `artifacts`. OS values: `"windows"`, `"linux"`, `"macos"` (normalized — `darwin` → `macos` via `normalize_os_name()`).

**Collection profiles** in `modules.py`: `triage`, `ransomware`, `insider_threat`, `full` — each has OS-specific module lists. Exposed via:
- `GET /modules?os=` — modules grouped by category
- `GET /modules/profiles` — all profiles with module counts
- `GET /modules/profiles/{profile_id}?os=` — module IDs for a profile

**Go registry** (`agent/internal/modules/registry.go`): `Init()` must be called once (in `main.go`) before creating the agent. It registers all module implementations. **The Go module IDs must be kept in sync with `MODULE_REGISTRY` in Python manually** — there is no automatic synchronization.

**Active Go modules** live directly in `agent/internal/modules/*.go` (e.g., `windows_logs.go`, `windows_artifacts.go`, `linux_system.go`). The subdirectories `agent/internal/modules/windows/` and `agent/internal/modules/linux/` contain legacy files tagged `//go:build ignore` — do not edit them.

**Parallel executor** (`agent/internal/jobs/executor.go`): goroutine pool with configurable concurrency (default 4 workers from `ConcurrencyLimit` in `JobInstruction`). Best-effort: continues on module failure, only fails if ALL modules fail.

**macOS**: `MODULE_REGISTRY` has 15 macOS module entries but **no Go implementation exists** for macOS modules. Do not add macOS to agent builds without implementing the Go modules.

### Frontend Patterns

**API client** (`src/lib/api.ts`): Use `apiGet`, `apiPost`, `apiPatch`, `apiPut`, `apiDelete` — they handle auth token injection from `localStorage` (`dfir_auth` key) and redirect to `/login` on 401.

**Auth state** is stored in `localStorage` as `{ token: string }` under key `dfir_auth`. Role and username are decoded from the JWT payload. Auth helpers are in `src/lib/auth.ts`.

**Routing**: React Router v6 in `App.tsx`. `ProtectedRoute` wraps all authenticated routes — it reads `getStoredAuth()` and redirects to `/login` if no token is present.

**Incident collection flow**: CreateIncident → `/incidents/:id/setup` (CollectionSetup) → `/incidents/:id/collect` (CollectionExecution). `CollectionSetup` passes `{ selectedModuleIds: string[] }` via `location.state` to `CollectionExecution`, which POSTs to `POST /incidents/{id}/collect` with body `{ module_ids?: string[], profile?: string }`.

**OS normalization**: `CollectionSetup` has a client-side `normalizeOS()` that mirrors server-side normalization. It shows auto-detected OS from the device but lets the user override it. Profile module counts update based on active OS.

**UI stack**: shadcn/ui components live in `src/components/ui/` (do not modify these). Custom reusable components are in `src/components/common/`. Feature components are directly in `src/components/`. Pages are in `src/pages/`.

### Agent Authentication
Agents authenticate via `X-Agent-Token: <AGENT_SHARED_SECRET>` header. The backend returns 401 if the token is missing or incorrect (uses `hmac.compare_digest` to prevent timing attacks).

### Environment Variables

**Backend** (`.env` or Docker env):
- `DATABASE_URL` — asyncpg PostgreSQL connection string
- `SECRET_KEY` — JWT signing key (startup fails if value matches known weak defaults)
- `AGENT_SHARED_SECRET` — shared secret for Go agent auth
- `EVIDENCE_STORAGE_PATH` — filesystem path for evidence (default `/vault/evidence`)
- `REQUIRE_AUTH` — set `false` only for local loopback access

**Frontend** (`.env` or Docker env):
- `VITE_API_BASE_URL` — backend base URL (default `http://localhost:8000/api/v1`)

`docker-compose.yml` uses `${SECRET_KEY:?...}` — compose refuses to start if `SECRET_KEY` is unset.
