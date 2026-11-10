# Self-Hosted CI/CD Auto-Update Guide

This guide explains how to operate the **DFIR Rapid Collection Kit** in a self-hosted environment with automated container updates—eliminating the need to re-compile Python wheels, React bundles, or Go agents locally.

---

## 1. How It Works (The Architecture)

```mermaid
flowchart LR
    A["Developer / Main Branch Push"] --> B["GitHub Actions CI/CD"]
    B -->|Build & Push Multi-Arch Images| C["GitHub Container Registry<br>(ghcr.io)"]
    B -->|Build Cross-Platform Agents| D["GitHub Releases<br>(SHA256 Signed)"]
    
    subgraph SelfHosted ["Self-Hosted Instance (Your Server / Lab)"]
        direction TB
        E["Docker Compose<br>(docker-compose.prod.yml)"]
        W["Watchtower (Optional Daemon)<br>(containrrr/watchtower)"]
        
        W -.->|Polls every 5 mins| C
        W -->|Auto Pull & Hot-Reload| E
    end
    
    C -->|make update (Manual Pull)| E
```

1. **Continuous Integration & Delivery (CI/CD)**:
   - When code is merged to `main` or tagged with `v*.*.*`, `.github/workflows/cd.yml` automatically triggers.
   - It builds hardened Docker images for both `backend` (FastAPI + Celery) and `frontend` (React + Nginx).
   - Images are tagged with `:latest` and the specific commit SHA, then pushed to GitHub Container Registry (`ghcr.io/angganovryanputra/dfir-collection-kit-*`).
   - If a Git release tag is pushed, cross-platform agent binaries (`.exe`, Linux, macOS) are compiled and attached to GitHub Releases.

2. **Self-Hosted Consumption**:
   - Instead of building containers locally with `docker compose up --build` (which consumes CPU and memory), your self-hosted host pulls the pre-compiled images directly from `ghcr.io`.

---

## 2. Choosing Your Auto-Update Strategy

### Strategy A: One-Command Fast Update (`make update` - Recommended)
When a new update is released or merged into `main`, you simply run:

```bash
make update
```

**What this does under the hood:**
1. Pulls the newest `:latest` images from `ghcr.io` (`docker compose -f docker-compose.prod.yml pull`).
2. Recreates only the updated containers gracefully with zero data loss (`docker compose -f docker-compose.prod.yml up -d`).
3. Automatically runs pending Alembic database migrations (`alembic upgrade head`).
4. Keeps all persistent database data and evidentiary files in Docker volumes intact.

---

### Strategy B: Fully Automated Background Auto-Update (Watchtower)
If you want your self-hosted server to auto-update itself in the background without any manual SSH or terminal commands, enable the built-in Watchtower profile:

```bash
make auto-update
```
*(Or via direct Compose: `docker compose -f docker-compose.prod.yml --profile auto-update up -d`)*

**How Watchtower behaves:**
- A tiny (~15MB), lightweight daemon container `dfir-watchtower` runs in the background.
- Every 300 seconds (5 minutes), it queries `ghcr.io` for image digest updates.
- When an updated image is detected, Watchtower gracefully stops the existing container, downloads the new image layer, and brings the container back up with identical network, environment, and volume mounts.
- It removes old, dangling image layers to prevent disk bloat (`WATCHTOWER_CLEANUP=true`).

---

## 3. Deployment Configuration

### Step 1: Environment & Secrets Setup
```bash
git clone https://github.com/angganovryanputra/dfir-collection-kit.git
cd dfir-collection-kit

# Run automated secrets and TLS certificate generator
make setup
```

### Step 2: Start Prebuilt Production Stack
```bash
# Standard deployment
make prod-up

# OR with background auto-update enabled
make auto-update
```

---

## 4. Disaster Recovery & Rollback

Every image pushed to `ghcr.io` is permanently tagged with its Git commit SHA. If an update ever introduces an unexpected regression, rollback instantly without recompiling:

```bash
# In your .env file, specify the target commit SHA
BACKEND_IMAGE=ghcr.io/angganovryanputra/dfir-collection-kit-backend:32672e2
FRONTEND_IMAGE=ghcr.io/angganovryanputra/dfir-collection-kit-frontend:32672e2

# Restart containers with the pinned version
make prod-up
```

---

## 5. Security & Isolation

- **Non-Root Execution**: Backend and frontend containers run as non-root user `dfir` (`UID 1000`).
- **Capability Dropping**: All containers enforce `cap_drop: ALL` and `no-new-privileges: true`.
- **Data Preservation**: Evidence `/vault/evidence` and PostgreSQL `/var/lib/postgresql/data` live inside isolated, named Docker volumes that persist across container recreation.

