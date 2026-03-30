# DFIR Rapid Collection Kit — Local Operations
# Usage: make <target>   |   make help

COMPOSE     := docker compose
AGENT_DIR   := agent
DIST_DIR    := $(AGENT_DIR)/dist

.DEFAULT_GOAL := help

.PHONY: help setup up down restart logs logs-backend logs-celery status \
        reset reset-volumes migrate seed seed-demo \
        agent-windows agent-linux agent-linux-arm64 agent-all \
        agent-config backup-db test-backend shell-backend

# ── Help ──────────────────────────────────────────────────────────────────────

help: ## Show available commands
	@awk 'BEGIN {FS = ":.*##"} /^[a-zA-Z_-]+:.*?##/ \
	  { printf "  \033[36m%-22s\033[0m %s\n", $$1, $$2 }' $(MAKEFILE_LIST)
	@echo ""
	@echo "  Quick start:  make setup"
	@echo "  Daily use:    make up | make down | make logs"
	@echo "  Agent build:  make agent-all"

# ── Setup & Lifecycle ─────────────────────────────────────────────────────────

setup: ## First-time setup: generate secrets, start services, run migrations
	@bash scripts/quickstart.sh

up: ## Start all services in background
	$(COMPOSE) up -d

down: ## Stop all services
	$(COMPOSE) down

restart: ## Restart all services
	$(COMPOSE) restart

rebuild: ## Rebuild and restart all services (after code changes)
	$(COMPOSE) up -d --build

logs: ## Tail logs from all services (Ctrl+C to exit)
	$(COMPOSE) logs -f

logs-backend: ## Tail backend + celery logs only
	$(COMPOSE) logs -f backend celery_worker

logs-nginx: ## Tail nginx access/error logs
	$(COMPOSE) logs -f nginx

status: ## Show service health and port bindings
	$(COMPOSE) ps

# ── Database ──────────────────────────────────────────────────────────────────

migrate: ## Apply pending Alembic migrations
	$(COMPOSE) exec backend alembic upgrade head

seed: ## Seed default users (idempotent — safe to run multiple times)
	$(COMPOSE) exec backend python -m app.seed_run

seed-demo: ## Seed demo incidents, devices, and timeline data
	$(COMPOSE) exec backend python -m app.seed_demo

backup-db: ## Dump PostgreSQL database to backups/
	@mkdir -p backups
	@FILE="backups/dfir-$$(date +%Y%m%d-%H%M%S).sql.gz"; \
	 $(COMPOSE) exec -T db pg_dump -U dfir dfir | gzip > "$$FILE" && \
	 echo "Backup saved: $$FILE"

# ── Reset / Destroy ───────────────────────────────────────────────────────────

reset: ## Stop services and remove containers (keeps volumes / data)
	$(COMPOSE) down

reset-volumes: ## DESTRUCTIVE: remove all containers AND volumes (deletes all data)
	@echo ""
	@echo "  WARNING: This will permanently delete the database and all evidence."
	@read -p "  Type 'yes' to confirm: " c && [ "$$c" = "yes" ] \
	  && $(COMPOSE) down -v \
	  || echo "Cancelled."

# ── Agent Build ───────────────────────────────────────────────────────────────

$(DIST_DIR):
	@mkdir -p $(DIST_DIR)

agent-windows: $(DIST_DIR) ## Build Windows (amd64) agent → agent/dist/dfir-agent.exe
	@echo "Building Windows agent..."
	cd $(AGENT_DIR) && \
	  GOOS=windows GOARCH=amd64 CGO_ENABLED=0 \
	  go build -trimpath -ldflags="-s -w" \
	  -o dist/dfir-agent.exe ./cmd/agent
	@echo "  -> $(DIST_DIR)/dfir-agent.exe"

agent-linux: $(DIST_DIR) ## Build Linux (amd64) agent → agent/dist/dfir-agent-linux
	@echo "Building Linux agent..."
	cd $(AGENT_DIR) && \
	  GOOS=linux GOARCH=amd64 CGO_ENABLED=0 \
	  go build -trimpath -ldflags="-s -w" \
	  -o dist/dfir-agent-linux ./cmd/agent
	@echo "  -> $(DIST_DIR)/dfir-agent-linux"

agent-linux-arm64: $(DIST_DIR) ## Build Linux ARM64 agent → agent/dist/dfir-agent-linux-arm64
	@echo "Building Linux ARM64 agent..."
	cd $(AGENT_DIR) && \
	  GOOS=linux GOARCH=arm64 CGO_ENABLED=0 \
	  go build -trimpath -ldflags="-s -w" \
	  -o dist/dfir-agent-linux-arm64 ./cmd/agent
	@echo "  -> $(DIST_DIR)/dfir-agent-linux-arm64"

agent-all: agent-windows agent-linux ## Build agent for Windows + Linux (amd64)
	@echo ""
	@echo "Agent binaries built in $(DIST_DIR)/"
	@ls -lh $(DIST_DIR)/

agent-config: ## Show agent environment config based on current .env
	@if [ ! -f .env ]; then echo "No .env found — run: make setup"; exit 1; fi
	@echo ""
	@echo "  Agent configuration:"
	@echo ""
	@echo "  # Copy to target host as dfir-agent.env"
	@echo "  DFIR_BACKEND_URL=https://<this-server-ip>/api/v1"
	@grep AGENT_SHARED_SECRET .env | sed 's/AGENT_SHARED_SECRET=/  DFIR_AGENT_SECRET=/'
	@echo ""
	@echo "  Run agent (Windows):"
	@echo "    set DFIR_BACKEND_URL=https://<server>/api/v1"
	@grep AGENT_SHARED_SECRET .env | sed 's/AGENT_SHARED_SECRET=\(.*\)/    set DFIR_AGENT_SECRET=\1/'
	@echo "    dfir-agent.exe"
	@echo ""

# ── Testing ───────────────────────────────────────────────────────────────────

test-backend: ## Run backend test suite inside the running container
	$(COMPOSE) exec backend bash -c \
	  "cd /app && DFIR_TEST_DATABASE_URL=postgresql+asyncpg://dfir:$$POSTGRES_PASSWORD@db:5432/dfir_test \
	   pytest -v --tb=short"

shell-backend: ## Open a bash shell in the backend container
	$(COMPOSE) exec backend bash
