# Getting Started Guide

## Prerequisites

### Docker Deployment (Recommended)

- Docker Engine 20.10 or higher
- Docker Compose v2.0 or higher
- At least 4GB RAM available
- At least 10GB free disk space

### Local Development

- Python 3.12+
- Node.js 20+ (or Bun)
- PostgreSQL 16+ (or Docker)
- Git

## Quick Start (Docker)

This is the fastest way to get DFIR Rapid Collection Kit running locally.

### Step 1: Clone the Repository

```bash
git clone <repository-url>
cd dfir-collection-kit
```

### Step 2: Generate Secure Secrets

```bash
# Generate SECRET_KEY for JWT signing
python3 -c "import secrets; print('SECRET_KEY=' + secrets.token_urlsafe(32))"

# Generate AGENT_SHARED_SECRET for agent authentication
python3 -c "import secrets; print('AGENT_SHARED_SECRET=' + secrets.token_urlsafe(32))"
```

Copy these values for the next step.

### Step 3: Configure Environment

Open `docker-compose.yml` and update the backend environment section:

```yaml
backend:
  environment:
    DATABASE_URL: postgresql+asyncpg://dfir:dfir@db:5432/dfir
    SECRET_KEY: <your-generated-secret-key>        # PASTE HERE
    ACCESS_TOKEN_EXPIRE_MINUTES: 60
    EVIDENCE_STORAGE_PATH: /vault/evidence
    AGENT_SHARED_SECRET: <your-generated-agent-secret>  # PASTE HERE
    REQUIRE_AUTH: true
```

### Step 4: Start the Application

```bash
docker compose up --build
```

This command will:
1. Pull PostgreSQL 16 image
2. Build and start the database
3. Build and start the FastAPI backend
4. Build and start the React frontend
5. Initialize the database with seed data

Watch for the following messages indicating success:
- `db: database system is ready to accept connections`
- `backend: Application startup complete`
- `frontend: ➜  Local:   http://localhost:5173/`

### Step 5: Access the Application

- **Frontend URL**: http://localhost:5173
- **Backend API**: http://localhost:8000
- **API Docs**: http://localhost:8000/docs

### Step 6: Login with Default Credentials

```
Username: admin
Password: admin123
Role: Admin
```

**⚠️ IMPORTANT**: Change the default password immediately after first login!

## Local Development Setup

If you prefer to develop without Docker, follow these steps.

### Backend Setup

#### 1. Install Python and Create Virtual Environment

```bash
cd backend

# Create virtual environment
python3 -m venv .venv

# Activate virtual environment
# On macOS/Linux:
source .venv/bin/activate
# On Windows (PowerShell):
.venv\Scripts\Activate.ps1
# On Windows (Command Prompt):
.venv\Scripts\activate.bat
```

#### 2. Install Dependencies

```bash
pip install -r requirements.txt
```

#### 3. Configure Environment

```bash
# Copy example environment file
cp .env.example .env

# Edit .env with your configuration
# Required settings:
DATABASE_URL=postgresql+asyncpg://dfir:dfir@localhost:5432/dfir
SECRET_KEY=your-secret-key-here
EVIDENCE_STORAGE_PATH=./vault/evidence
AGENT_SHARED_SECRET=your-agent-secret-here
REQUIRE_AUTH=true
```

#### 4. Set Up PostgreSQL

**Option A: Use Docker for database only**

```bash
docker run -d \
  --name dfir-db \
  -e POSTGRES_USER=dfir \
  -e POSTGRES_PASSWORD=dfir \
  -e POSTGRES_DB=dfir \
  -p 5432:5432 \
  postgres:16
```

**Option B: Use local PostgreSQL**

Install PostgreSQL 16 locally and create the database:
```bash
createdb dfir
```

#### 5. Initialize the Database

```bash
# Create tables and seed data
python -m app.seed_run.py
```

You should see output like:
```
Database initialized successfully
Seed data created
```

#### 6. Run the Backend

```bash
# Development server with auto-reload
uvicorn app.main:app --reload --port 8000

# Or without reload
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

The backend will be available at http://localhost:8000
API documentation: http://localhost:8000/docs

### Frontend Setup

#### 1. Install Node.js

Ensure you have Node.js 20 or higher installed:
```bash
node --version  # Should be v20.x.x or higher
npm --version  # Should be 10.x.x or higher
```

#### 2. Install Dependencies

```bash
cd frontend

# Using npm
npm install

# Using bun (faster)
bun install
```

#### 3. Configure Environment

```bash
# If .env.example exists, copy it
cp .env.example .env

# Edit .env
VITE_API_BASE_URL=http://localhost:8000/api/v1
```

#### 4. Run the Frontend

```bash
# Development server
npm run dev

# Or with bun
bun run dev
```

The frontend will be available at http://localhost:5173

## First Workflow: Creating an Incident

After logging in, follow these steps to create your first incident:

### 1. Navigate to Create Incident

Click **"Create Incident"** in the sidebar menu.

### 2. Fill Incident Details

- **Incident Type**: Select from available types (Ransomware, Account Compromise, etc.)
- **Incident ID**: Auto-generated (e.g., `INC-2026-001`)
- **Target Endpoints**: Add hostnames or IP addresses of target systems
- **Operator Name**: Enter your name or badge ID

### 3. Start Collection

Click **"START COLLECTION"** button.

The system will:
1. Create the incident record
2. Create an initial chain-of-custody entry
3. Redirect you to the collection execution page

### 4. Add Devices (Optional)

Navigate to **Devices** page to register collection agents:
- Click **"ADD DEVICE"**
- Fill in device details (hostname, IP, OS, agent version)
- Device will appear in the device list

### 5. View Evidence

Once collection is complete (via Go agent), navigate to:
- **Evidence Vault**: View all collected evidence
- **Chain of Custody**: Review audit trail

## Common Issues and Solutions

### Backend: "Database connection failed"

**Problem**: Backend cannot connect to PostgreSQL.

**Solutions**:
1. Ensure PostgreSQL is running: `docker compose ps db`
2. Check database logs: `docker compose logs db`
3. Verify connection string in `.env` or `docker-compose.yml`
4. Ensure port 5432 is not blocked by firewall

### Frontend: "Connection refused"

**Problem**: Frontend cannot reach backend.

**Solutions**:
1. Check backend is running: `docker compose ps backend`
2. Verify `VITE_API_BASE_URL` in frontend environment
3. For Docker: Use `http://backend:8000/api/v1`
4. For local dev: Use `http://localhost:8000/api/v1`

### Authentication: "401 Unauthorized"

**Problem**: API requests are failing with 401 errors.

**Solutions**:
1. Check you're logged in (token in `localStorage`)
2. Verify token hasn't expired (default: 60 minutes)
3. Check `SECRET_KEY` is set in backend
4. Clear browser localStorage and login again

### Evidence Upload: "503 Agent shared secret not configured"

**Problem**: Agent cannot upload evidence.

**Solutions**:
1. Set `AGENT_SHARED_SECRET` in backend environment
2. Ensure agent sends `X-Agent-Token` header
3. Restart backend after changing environment variables

### Docker: "Port already in use"

**Problem**: Docker reports port is already allocated.

**Solutions**:
1. Check what's using the port:
   ```bash
   # macOS/Linux
   lsof -i :8000
   lsof -i :5173
   lsof -i :5432
   
   # Windows
   netstat -ano | findstr :8000
   netstat -ano | findstr :5173
   netstat -ano | findstr :5432
   ```
2. Stop conflicting service or change port in `docker-compose.yml`

### Database: "relation does not exist"

**Problem**: Database tables not created.

**Solutions**:
1. Run seed script: `python -m app.seed_run.py`
2. For Docker: Recreate containers: `docker compose down && docker compose up --build`

## Next Steps

### For Users

1. **Create your first incident**: Follow the workflow above
2. **Register a device**: Add a target system to the device list
3. **Review templates**: Check the Incident Templates page for presets
4. **Explore the API**: Visit http://localhost:8000/docs

### For Developers

1. **Read the architecture**: See `docs/ARCHITECTURE.md`
2. **Review the codebase**: Explore frontend and backend structure
3. **Run tests** (if available): `pytest` in backend directory
4. **Contribute**: Check the contributing guidelines in README

### For Operators

1. **Create a standard operating procedure (SOP)** based on your workflow
2. **Train your team** on incident creation and evidence review
3. **Configure backups** for evidence storage and database
4. **Set up monitoring** for evidence collection jobs

## Additional Resources

- **Architecture Documentation**: `docs/ARCHITECTURE.md`
- **API Reference**: http://localhost:8000/docs (when backend is running)
- **Project README**: `README.md`
- **Issue Tracker**: GitHub Issues

## Getting Help

If you encounter issues not covered in this guide:

1. Check the **Troubleshooting** section above
2. Review the **Architecture** documentation
3. Search existing GitHub issues
4. Create a new issue with:
   - Your operating system and version
   - Docker or local deployment
   - Complete error messages
   - Steps to reproduce the problem
