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
python -m app.seed_run          # Initialize DB and seed default users
uvicorn app.main:app --reload --port 8000
```

### Database migrations (Alembic)
```bash
cd backend
alembic upgrade head            # Apply all migrations
alembic revision --autogenerate -m "description"  # Create new migration
```

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

**Audit log** (`app/services/audit_log_service.py`) is separate from Chain of Custody. It uses the same tamper-evident hash chaining pattern but for system/API events (auth, permission denials, etc.). Use `safe_record_event()` when recording should not fail the request.

**Evidence pipeline**: Agent uploads a ZIP → backend extracts → SHA256 hashes all files → writes `hashes.sha256` manifest → appends `chain-of-custody.log` → creates DB records → writes `LOCKED` marker. The folder is then immutable.

**Chain of Custody integrity**: Each `ChainOfCustodyEntry` includes `sequence`, `previous_hash`, and `entry_hash` computed over all fields. The `GET /api/v1/chain-of-custody` endpoint verifies the full chain on read and returns 409 if corrupted.

### Frontend Patterns

**API client** (`src/lib/api.ts`): Use `apiGet`, `apiPost`, `apiPatch`, `apiPut`, `apiDelete` — they handle auth token injection from `localStorage` (`dfir_auth` key) and redirect to `/login` on 401.

**Auth state** is stored in `localStorage` as `{ token: string }` under key `dfir_auth`. Role and username are decoded from the JWT payload.

**UI stack**: shadcn/ui components live in `src/components/ui/` (do not modify these). Custom reusable components are in `src/components/common/`. Feature components are directly in `src/components/`. Pages are in `src/pages/`.

**Routing**: React Router v6 in `App.tsx`. No auth guard at the router level — individual pages check auth state and redirect.

### Agent Authentication
Agents authenticate via `X-Agent-Token: <AGENT_SHARED_SECRET>` header. The backend rejects agent endpoints with 503 if `AGENT_SHARED_SECRET` is not configured.

### Environment Variables

**Backend** (`.env` or Docker env):
- `DATABASE_URL` — asyncpg PostgreSQL connection string
- `SECRET_KEY` — JWT signing key (startup fails with default `change-me` when `REQUIRE_AUTH=true`)
- `AGENT_SHARED_SECRET` — shared secret for Go agent auth
- `EVIDENCE_STORAGE_PATH` — filesystem path for evidence (default `/vault/evidence`)
- `REQUIRE_AUTH` — set `false` only for local loopback access

**Frontend** (`.env` or Docker env):
- `VITE_API_BASE_URL` — backend base URL (default `http://localhost:8000/api/v1`)

### Roles
Three roles with decreasing permissions: `admin` > `operator` > `viewer`. The `require_roles()` dependency accepts multiple roles: `require_roles("admin", "operator")`.
