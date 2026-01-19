# DFIR Rapid Collection Kit

**Evidence Collection and Management System for Digital Forensics & Incident Response**

## Overview

DFIR Rapid Collection Kit is a secure, web-based platform for managing incident response operations and collecting digital evidence. Built with a modern tech stack, it provides a complete workflow from incident creation to evidence storage with chain-of-custody tracking.

## Features

- **Incident Management**: Create, track, and manage DFIR incidents
- **Evidence Collection**: Automated evidence collection via Go-based agents
- **Chain of Custody**: Tamper-evident audit trail with hash chaining
- **Evidence Vault**: Secure storage with SHA256 hashing and export capabilities
- **Agent Management**: Register and monitor collection agents
- **Template System**: Reusable incident templates with preset checklists
- **Role-Based Access**: Admin, Operator, and Viewer roles with fine-grained permissions
- **Docker Ready**: Single-command deployment with Docker Compose

## Architecture

### Components

```
┌─────────────────────────────────────────────────────────────────┐
│                        User Browser                         │
│                   (React + TypeScript)                      │
└────────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Frontend (Vite)                        │
│                   Port: 5173                                │
└────────────────────────────────┬────────────────────────────────┘
                             │
                             ▼ (REST API)
┌─────────────────────────────────────────────────────────────────┐
│                  Backend (FastAPI)                         │
│                   Port: 8000                                │
└────────────┬───────────────────────────────┬────────────────┘
             │                               │
             ▼                               │
┌────────────────────────┐            ┌──────────────────┐
│  PostgreSQL Database │            │ Evidence Storage│
│      (Port: 5432)   │            │   /vault/evidence│
└────────────────────────┘            └──────────────────┘
                                             ▲
                                             │ (Upload)
                                  ┌──────────────────────────────┐
                                  │    Go Agents (Future)      │
                                  │   Poll jobs, Upload ZIPs    │
                                  └──────────────────────────────┘
```

### Tech Stack

**Frontend**:
- React 18 with TypeScript
- Vite for build tooling
- Tailwind CSS for styling
- shadcn/ui components

**Backend**:
- FastAPI (Python 3.12)
- SQLAlchemy 2.0 with async PostgreSQL
- JWT authentication with bcrypt password hashing
- Alembic for database migrations

**Infrastructure**:
- Docker & Docker Compose
- PostgreSQL 16
- Nginx (future reverse proxy)

## Quick Start with Docker

### Prerequisites

- Docker Engine 20.10+
- Docker Compose v2.0+
- 4GB RAM minimum
- 10GB free disk space

### 1. Clone the Repository

```bash
git clone <repository-url>
cd dfir-collection-kit
```

### 2. Configure Environment

Review `docker-compose.yml` and adjust environment variables as needed:

```yaml
# Backend environment
DATABASE_URL: postgresql+asyncpg://dfir:dfir@db:5432/dfir
SECRET_KEY: <generate-strong-secret-here>      # REQUIRED for production
ACCESS_TOKEN_EXPIRE_MINUTES: 60
EVIDENCE_STORAGE_PATH: /vault/evidence
AGENT_SHARED_SECRET: <generate-agent-secret-here> # REQUIRED for agents
REQUIRE_AUTH: true
```

**Generate secure secrets**:
```bash
# For SECRET_KEY (backend JWT)
python3 -c "import secrets; print(secrets.token_urlsafe(32))"

# For AGENT_SHARED_SECRET (agent authentication)
python3 -c "import secrets; print(secrets.token_urlsafe(32))"
```

### 3. Start the System

```bash
docker compose up --build
```

This will:
- Build and start PostgreSQL
- Build and start the FastAPI backend (port 8000)
- Build and start the React frontend (port 5173)
- Create evidence storage volume
- Initialize the database and seed initial data

### 4. Access the Application

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:8000
- **API Documentation**: http://localhost:8000/docs

### Default Credentials

The system is seeded with a default admin user:

- **Username**: `admin`
- **Password**: `admin123`
- **Role**: Admin

**⚠️ IMPORTANT**: Change the default password immediately after first login!

## Security Notes

### Critical Security Settings

1. **SECRET_KEY**: Required for JWT token signing. Never use the default `change-me` in production.
2. **AGENT_SHARED_SECRET**: Required for agent authentication. Must match agent configuration.
3. **REQUIRE_AUTH**: Keep `true` in production. Set to `false` only for local development.
4. **ALLOWED_ORIGINS**: Restrict to your frontend domain in production.

### Evidence Integrity

- All evidence files are SHA256 hashed on upload
- Chain-of-custody entries are cryptographically chained
- Evidence folders are locked after upload
- Hash manifests are stored alongside evidence

### Data Storage

- **Evidence files**: Stored in Docker volume `dfir_evidence` (or `/vault/evidence`)
- **Database**: Stored in Docker volume `dfir_postgres`
- **Backups**: Regularly backup these volumes for disaster recovery

## Workflows

### 1. Create an Incident

1. Login to the application
2. Navigate to **Create Incident**
3. Fill in incident details:
   - Incident type (Ransomware, Account Compromise, etc.)
   - Target endpoints (hostnames/IPs)
   - Operator name
4. Click **Start Collection**

### 2. Configure Collection

After creating an incident, you can:

- **Add Devices**: Register agents for target systems
- **Select Modules**: Choose collection modules (memory dump, logs, etc.)
- **Assign Agents**: Assign agents to collection jobs

### 3. Run Collection

1. Agents poll for jobs via `/agents/{agent_id}/jobs/next`
2. Agent receives `JobInstruction` with modules and target
3. Agent executes collection and uploads ZIP to `/agents/{agent_id}/jobs/{job_id}/upload`
4. Backend extracts, hashes, and stores evidence
5. Chain-of-custody entry is automatically created

### 4. Review Evidence

1. Navigate to **Evidence Vault**
2. Select incident to view collected evidence
3. Download individual files or export entire collection as ZIP
4. Review chain-of-custody logs for audit trail

### 5. Close Incident

1. Navigate to **Dashboard** or incident detail
2. Update incident status to **CLOSED**
3. Generate final report (feature coming soon)

## API Reference

### Authentication

Most endpoints require authentication. Include the JWT token in the header:

```http
Authorization: Bearer <your-jwt-token>
```

### Key Endpoints

#### Incidents
- `GET /api/v1/incidents` - List all incidents
- `POST /api/v1/incidents` - Create incident
- `GET /api/v1/incidents/{id}` - Get incident details
- `DELETE /api/v1/incidents/{id}` - Delete incident (admin only)

#### Evidence
- `GET /api/v1/evidence/folders` - List evidence folders
- `GET /api/v1/evidence/items?incident_id={id}` - List evidence items
- `POST /api/v1/evidence/exports` - Create export job
- `GET /api/v1/evidence/exports/incident/{id}` - Download incident ZIP

#### Agents
- `POST /api/v1/agents/register` - Register new agent
- `GET /api/v1/agents/{agent_id}/jobs/next` - Poll for next job (agent auth required)
- `POST /api/v1/agents/{agent_id}/jobs/{job_id}/upload` - Upload evidence ZIP

#### Chain of Custody
- `GET /api/v1/chain-of-custody` - List all entries
- `GET /api/v1/chain-of-custody/incident/{id}` - List entries for incident

For complete API documentation, visit `/docs` when the backend is running.

## Development

### Backend Development

```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env with your configuration
python -m app.seed_run.py  # Initialize database
uvicorn app.main:app --reload --port 8000
```

### Frontend Development

```bash
cd frontend
npm install
cp .env.example .env
# Edit .env with your API base URL
npm run dev
```

## Troubleshooting

### Backend fails to start

Check database connection:
```bash
docker compose logs backend
```

Ensure PostgreSQL is healthy:
```bash
docker compose ps db
```

### Frontend cannot connect to backend

Verify environment variable:
```bash
docker compose exec frontend env | grep VITE_API_BASE_URL
```

Should be `http://backend:8000/api/v1` when running in Docker.

### Evidence upload fails

Check agent shared secret:
```bash
docker compose exec backend env | grep AGENT_SHARED_SECRET
```

Ensure agent sends the correct `X-Agent-Token` header.

## Contributing

Contributions are welcome! Please follow these guidelines:

1. Fork the repository
2. Create a feature branch
3. Make your changes with tests
4. Submit a pull request

## License

This project is licensed under the MIT License.

## Support

For issues, questions, or contributions, please use the GitHub issue tracker.
