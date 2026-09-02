# CODEX.md — Universal AI Coding Guide

> **Purpose**: Panduan untuk AI LLM (Codex, Claude, GPT-4, Cursor, Windsurf) agar cepat memahami struktur project dan hemat token saat vibe coding.

---

## ⚡ Quick Context (Baca Ini Dulu!)

**Project**: DFIR Rapid Collection Kit — Evidence collection & management system untuk Digital Forensics & Incident Response.

**Architecture**: 3-tier monorepo
- **Backend**: FastAPI (Python 3.12) + async SQLAlchemy + PostgreSQL + Redis + Celery
- **Frontend**: React 18 + TypeScript + Vite + Tailwind + shadcn/ui
- **Agent**: Go 1.23 (collection agent untuk Windows/Linux/macOS endpoints)

**Key Stats**: 305 source files, 14 DB migrations, 18 API routers, 131 collection modules

---

## 🗺️ Project Map

```
dfir-collection-kit/
├── backend/
│   ├── app/
│   │   ├── api/v1/endpoints/    → HTTP handlers (thin, delegate to CRUD)
│   │   ├── core/                → config, deps, security, evidence_files, modules
│   │   ├── crud/                → All DB operations (SQLAlchemy async)
│   │   ├── models/              → 15 ORM models
│   │   ├── schemas/             → Pydantic request/response
│   │   ├── services/            → Business logic (pipeline, forensics, AI)
│   │   └── worker.py            → Celery tasks
│   ├── alembic/versions/        → 14 migrations
│   └── tests/                   → 5 test files
├── frontend/
│   └── src/
│       ├── components/          → 75 files (ui/, common/, feature/)
│       ├── pages/               → 42 pages
│       ├── hooks/               → Custom React hooks
│       ├── lib/                 → API client, auth, utils
│       └── context/             → React contexts
├── agent/
│   └── internal/
│       ├── modules/             → Collection modules (Windows/Linux/macOS)
│       ├── jobs/                → Goroutine pool executor
│       ├── parsers/             → Local parsers (EVTX, Prefetch, LNK)
│       └── api/                 → Backend API client
└── .github/workflows/           → CI/CD pipelines
```

---

## 🔑 Key Patterns (WAJIB TAHU)

### 1. RBAC Enforcement
```python
# Semua protected endpoint pakai require_roles()
@router.delete("/{id}", dependencies=[Depends(require_roles("admin"))])
@router.post("/", dependencies=[Depends(require_roles("operator", "admin"))])
```
Roles: `admin` > `operator` > `viewer`

### 2. Async Everything
```python
# Backend SEMUA async — jangan blocking I/O langsung
# SALAH:
result = some_sync_io()
# BENAR:
result = await asyncio.to_thread(some_sync_io)
# atau:
async with AsyncSessionLocal() as db:
    result = await db.execute(query)
```

### 3. Module Registry (Python ↔ Go sync)
```python
# Python: backend/app/core/modules.py
MODULE_REGISTRY = {
    "windows_process_list": {"os": "windows", "category": "volatile", ...},
    "linux_journalctl": {"os": "linux", "category": "logs", ...},
}
# Go: agent/internal/modules/registry.go
# HARUS manual sync — tidak ada auto-sync!
```

### 4. Evidence Pipeline Flow
```
Agent Upload → Extract ZIP → SHA256 Hash → Write Manifest → Chain of Custody → LOCKED
     ↓
Celery Worker → EZTools Parse → Sigma Hunt → Timeline Merge → DuckDB
```

### 5. Frontend API Client
```typescript
// Selalu pakai helper ini — handle auth + 401 redirect
import { apiGet, apiPost } from '@/lib/api';
const data = await apiGet('/incidents');
await apiPost('/incidents', { name: "Ransomware Case" });
```

---

## 🗄️ Database Schema (15 Models)

| Model | Purpose | Key Fields |
|-------|---------|------------|
| `Incident` | DFIR cases | id, title, status, severity |
| `Device` | Target endpoints | id, hostname, os, ip_address |
| `Job` | Collection jobs | id, incident_id, agent_id, status |
| `EvidenceItem` | Collected files | id, incident_id, hash, status |
| `ChainOfCustodyEntry` | Audit trail | id, evidence_id, action, hash |
| `ProcessingJob` | Pipeline status | id, job_id, phase, status |
| `SigmaHit` | Detection alerts | id, rule_name, severity |
| `SuperTimeline` | Merged timeline | id, incident_id, duckdb_path |
| `User` | Auth | id, username, role |
| `Template` | Incident templates | id, name, module_ids |

**Migration chain** (latest): `20260603_ai_settings`

---

## 🚀 Development Commands

```bash
# Docker (primary)
docker compose up --build -d    # Start all services
docker compose logs -f backend  # Tail logs

# Backend local
cd backend && source .venv/bin/activate
alembic upgrade head            # Run migrations
python -m app.seed_run          # Seed users
uvicorn app.main:app --reload

# Frontend local
cd frontend && npm install && npm run dev

# Agent build
cd agent && go build ./cmd/agent/

# Testing
cd backend && DFIR_TEST_DATABASE_URL=postgresql+asyncpg://dfir:dfir@localhost:5432/dfir_test pytest
cd agent && go test ./...
cd frontend && npm run lint
```

---

## 🔐 Security Checklist

- [ ] `SECRET_KEY` ≠ default (startup fails if weak)
- [ ] `AGENT_SHARED_SECRET` set (startup fails if empty)
- [ ] `REQUIRE_AUTH=true` in production
- [ ] `ALLOWED_ORIGINS` set (no wildcard)
- [ ] Evidence folders marked `LOCKED` after collection
- [ ] Chain of Custody hash-chained & verified on read

---

## 🎯 Common Tasks (Copy-Paste Ready)

### Add New API Endpoint
1. Create handler in `backend/app/api/v1/endpoints/`
2. Add CRUD operations in `backend/app/crud/`
3. Add Pydantic schemas in `backend/app/schemas/`
4. Register router in `backend/app/api/v1/api.py`

### Add New Collection Module
1. Add entry to `MODULE_REGISTRY` in `backend/app/core/modules.py`
2. Implement Go module in `agent/internal/modules/`
3. Register in `agent/internal/modules/registry.go`
4. Add parser support in `backend/app/services/timesketch_export_service.py`

### Add New DB Model
1. Create model in `backend/app/models/`
2. Generate migration: `alembic revision --autogenerate -m "add X"`
3. Apply: `alembic upgrade head`
4. Create CRUD in `backend/app/crud/`
5. Create schemas in `backend/app/schemas/`

### Add New Frontend Page
1. Create page in `frontend/src/pages/`
2. Add route in `frontend/src/App.tsx`
3. Add API calls in `frontend/src/lib/api.ts`
4. Add navigation link di sidebar

---

## ⚠️ Gotchas (Jangan Lupa!)

1. **Python ↔ Go module IDs must sync manually** — tidak ada auto-sync
2. **All file I/O must use `asyncio.to_thread()`** — jangan blocking event loop
3. **JWT expiry only invalidation** — tidak ada session revocation
4. **macOS modules fully implemented** — 17 modules dengan Go implementation
5. **Evidence pipeline is idempotent** — phase markers prevent re-processing
6. **Frontend uses `location.state`** — untuk pass data antar pages (CollectionSetup → CollectionExecution)

---

## 📊 API Endpoints (18 Routers)

| Router | Path | Purpose |
|--------|------|---------|
| auth | `/api/v1/auth` | Login, logout |
| incidents | `/api/v1/incidents` | CRUD + collect + report |
| devices | `/api/v1/devices` | Endpoint management |
| agents | `/api/v1/agents` | Agent registration + jobs |
| jobs | `/api/v1/jobs` | Job management |
| evidence | `/api/v1/evidence` | Evidence vault + timeline |
| processing | `/api/v1/processing` | Pipeline trigger + status |
| chain-of-custody | `/api/v1/chain-of-custody` | Audit trail |
| modules | `/api/v1/modules` | Collection modules |
| templates | `/api/v1/templates` | Incident templates |
| users | `/api/v1/users` | User management (admin) |
| audit-logs | `/api/v1/audit-logs` | System audit logs |
| platform | `/api/v1/platform` | Custom modules, hypotheses, scheduled |
| threat-intel | `/api/v1/threat-intel` | VirusTotal + MISP |
| ai | `/api/v1/ai` | LLM annotation, summary, NL query |
| case | `/api/v1/case` | TheHive, Jira, Slack export |
| collectors | `/api/v1/collectors` | Collector management |
| settings | `/api/v1/settings` | System settings |

---

## 🧪 Testing Strategy

```bash
# Backend (pytest + asyncio)
pytest tests/ -v --cov=app --cov-fail-under=70

# Go agent (with race detection)
go test -v -race ./...

# Frontend (ESLint + type check)
npm run lint && npx tsc --noEmit

# Integration (Docker smoke test)
docker compose up -d && curl -f http://localhost:8000/api/v1/status/health
```

---

## 📝 Code Style

| Language | Formatter | Linter | Line Length |
|----------|-----------|--------|-------------|
| Python | Black | Flake8 + isort | 100 |
| Go | gofmt | go vet + staticcheck | - |
| TypeScript | Prettier | ESLint | 80 |

---

## 🔗 Useful Links

- **Interactive API Docs**: http://localhost:8000/docs
- **GitHub Actions**: https://github.com/angganovryanputra/dfir-collection-kit/actions
- **DuckDB Timeline**: `{evidence_path}/{incident_id}/super_timeline.duckdb`
- **Evidence Storage**: `/vault/evidence` (Docker volume)

---

> **Last Updated**: 2026-09-02
> **Version**: 1.0.0
