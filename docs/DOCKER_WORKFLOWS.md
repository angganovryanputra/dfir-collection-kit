# Docker Workflows

The production Compose definition is [docker-compose.yml](../docker-compose.yml).
It keeps PostgreSQL, Redis, Celery state, and the evidence vault in named volumes.
Normal restart and update commands do **not** remove those volumes.

## First install (production-like)

1. Install Docker Desktop and make sure it is running.
2. On Windows PowerShell, run `powershell -ExecutionPolicy Bypass -File
   scripts/setup-docker.ps1`. Add `-DemoData` for a safe local feature demo;
   it generates `.env` and a local self-signed TLS certificate without requiring
   Git Bash or WSL. On Git Bash/WSL, the existing `scripts/generate-secrets.sh`
   remains available.
3. Run `docker compose up -d --build`.
4. Run `powershell -ExecutionPolicy Bypass -File scripts/docker-smoke-test.ps1`.

The application is served at `https://localhost`. The API is available below
`https://localhost/api/v1`; backend, database, and Redis are intentionally not
published to the network.

## Development with live reload

Use the development override, which changes no production configuration:

```powershell
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

- Frontend: `http://localhost:5173` with Vite HMR.
- Backend: `http://localhost:8000/api/v1` with FastAPI reload.
- Database and evidence remain in the same named volumes as production.
- Source directories are bind-mounted; editing `frontend/` or `backend/app/`
  does not require an image rebuild.
- Restart Celery after editing task code:
  `docker compose -f docker-compose.yml -f docker-compose.dev.yml restart celery_worker celery_beat`.

Run the development smoke test after startup:

```powershell
pwsh -File scripts/docker-smoke-test.ps1 -Development
```

Stop development containers without deleting data:

```powershell
docker compose -f docker-compose.yml -f docker-compose.dev.yml down
```

## Safe update

Before updating, create a database/evidence backup using
`scripts/docker-backup.sh` (Git Bash/WSL) and store it off-host. Then use:

```powershell
pwsh -File scripts/docker-update.ps1
pwsh -File scripts/docker-smoke-test.ps1
```

The update script pulls external images, rebuilds local application images,
applies migrations through the backend startup command, and waits for health.
It deliberately does not run `docker compose down -v`, `docker volume rm`, or
any command that deletes evidence.

## Feature workflow test

After the smoke test, use this short acceptance flow:

1. Sign in with the admin account in `.env`.
2. Confirm **Dashboard** and **Devices** load.
3. Register an agent (or use the agent dry-run mode), create an incident, and
   start a small collection profile.
4. Observe the collection status and Celery logs.
5. Verify the evidence item and chain-of-custody entry, then export the report.

For a non-destructive backend-only check, run `docker compose exec backend
pytest -q`. Database integration tests require `DFIR_TEST_DATABASE_URL`.
