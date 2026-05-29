# GEMINI.md - DFIR Rapid Collection Kit

## Project Overview

DFIR Rapid Collection Kit is a comprehensive evidence collection and management system designed for Digital Forensics & Incident Response (DFIR) operations. It automates the workflow from incident creation to evidence collection, parsing, and threat hunting.

### Tech Stack
- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui, TanStack Query v5.
- **Backend**: FastAPI (Python 3.12), SQLAlchemy 2.0 (async), Alembic, Pydantic v2.
- **Agent**: Go 1.25 (parallel modules, local binary parsing).
- **Database**: PostgreSQL 16, Redis 7 (Celery broker).
- **Forensics Pipeline**: Background Celery workers using EZTools, Hayabusa, Chainsaw, and DuckDB for super-timelining.
- **Deployment**: Docker Compose, Nginx.

### Architecture
- **3-Tier Design**: React SPA -> FastAPI REST API -> PostgreSQL/Redis/Storage.
- **Agent System**: Go-based agents poll for jobs, execute collection modules, parse artifacts locally, and upload signed ZIPs.
- **Evidence Vault**: Hash-chained, tamper-evident storage with immutable \`LOCKED\` states and cryptographic verification.
- **Pipeline**: Automated parsing (EVTX, MFT, Registry, etc.) and Sigma-based threat hunting.

---

## Building and Running

The project is primarily managed via a \`Makefile\` and Docker Compose.

### Quick Start
\`\`\`bash
make setup              # First-time setup: secrets, services, migrations, seed
make up                 # Start all services in background
make down               # Stop all services
make logs               # Tail all logs
make status             # Show service health
\`\`\`

### Database Management
\`\`\`bash
make migrate            # Apply pending Alembic migrations
make seed               # Seed default admin user
make seed-demo          # Seed demo data (incidents, devices, timeline)
make backup-db          # Dump PostgreSQL database
\`\`\`

### Agent Development
\`\`\`bash
make agent-windows      # Build Windows (amd64) agent
make agent-linux        # Build Linux (amd64) agent
make agent-all          # Build both Windows and Linux agents
\`\`\`

### Testing
\`\`\`bash
make test-backend       # Run backend tests in the container
\`\`\`

---

## Development Conventions

### General Guidelines
- **Security First**: Never log or commit secrets. Use \`.env\` files (see \`.env.example\`).
- **Contextual Precedence**: Always refer to \`docs/ARCHITECTURE.md\` for deep architectural details.
- **Audit Logging**: All sensitive actions must be logged via the hash-chained \`AuditLogService\`.

### Backend (Python/FastAPI)
- **Formatting**: \`black\` (line length 100), \`isort\` (profile=black).
- **Type Safety**: Use Pydantic v2 schemas for all API inputs/outputs.
- **Database**: Use async SQLAlchemy 2.0 patterns. Migrations are managed by Alembic in \`backend/alembic/\`.
- **RBAC**: Enforce roles using the \`require_roles\` dependency in \`app/core/deps.py\`.

### Frontend (React/TypeScript)
- **Styling**: Tailwind CSS + shadcn/ui.
- **State Management**: TanStack Query (React Query) for server state.
- **API Interaction**: Use \`apiGet\`, \`apiPost\`, etc., from \`src/lib/api.ts\` to ensure JWT handling.
- **Pages**: Feature pages reside in \`src/pages/\`. Layout components are in \`src/components/layout/\`.

### Agent (Go)
- **Go Version**: 1.25.
- **Module Sync**: The Python \`MODULE_REGISTRY\` in \`backend/app/core/modules.py\` must be kept in sync manually with Go implementations in \`agent/internal/modules/\`.
- **Parsing**: On-device parsing logic lives in \`agent/internal/parsers/\`.

### Code Structure
- \`agent/\`: Go agent source code.
- \`backend/app/\`: FastAPI backend (api, models, schemas, crud, services).
- \`frontend/src/\`: React frontend (components, pages, hooks, lib).
- \`docs/\`: Detailed documentation and artifact schemas.
- \`scripts/\`: Deployment and setup scripts.

---

## Key Files
- \`README.md\`: High-level overview and feature list.
- \`docs/ARCHITECTURE.md\`: Detailed system design and workflows.
- \`Makefile\`: Primary entry point for all lifecycle commands.
- \`backend/app/core/modules.py\`: Registry of all collection modules and profiles.
- \`backend/app/main.py\`: FastAPI app entry point and middleware.
- \`agent/cmd/agent/main.go\`: Go agent entry point.
