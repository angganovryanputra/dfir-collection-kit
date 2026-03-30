#!/usr/bin/env bash
# DFIR Rapid Collection Kit — One-command local setup
# Usage: bash scripts/quickstart.sh  OR  make setup
set -euo pipefail

CYAN='\033[0;36m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; BOLD='\033[1m'; NC='\033[0m'
info()  { echo -e "${CYAN}  [INFO]${NC} $*"; }
ok()    { echo -e "${GREEN}  [ OK ]${NC} $*"; }
warn()  { echo -e "${YELLOW}  [WARN]${NC} $*"; }
die()   { echo -e "${RED} [FAIL]${NC} $*" >&2; exit 1; }
step()  { echo -e "\n${BOLD}$*${NC}"; }

# ── Resolve project root ──────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"

echo -e "\n${CYAN}╔══════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║    DFIR Rapid Collection Kit — Setup     ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════╝${NC}\n"

# ── Dependency checks ─────────────────────────────────────────────────────────
step "1. Checking dependencies..."
command -v docker >/dev/null 2>&1        || die "docker is required. Install from https://docs.docker.com/engine/install/"
docker compose version >/dev/null 2>&1  || die "docker compose v2 is required (not the old docker-compose plugin)"
command -v curl   >/dev/null 2>&1        || warn "curl not found — health checks may not work"
command -v openssl >/dev/null 2>&1       && HAS_OPENSSL=true || { HAS_OPENSSL=false; warn "openssl not found — HTTPS cert will not be generated"; }
ok "All required dependencies found"

# ── Generate .env ─────────────────────────────────────────────────────────────
step "2. Generating secrets..."
if [ -f .env ]; then
    ok ".env already exists — skipping (delete it to regenerate)"
else
    bash scripts/generate-secrets.sh
    ok ".env generated with strong random secrets"
fi

# ── Generate TLS certificate ──────────────────────────────────────────────────
step "3. Generating TLS certificate..."
if [ -f nginx/certs/cert.pem ] && [ -f nginx/certs/key.pem ]; then
    ok "TLS certificate already exists — skipping"
elif $HAS_OPENSSL; then
    bash scripts/generate-self-signed-cert.sh
    ok "Self-signed TLS certificate created in nginx/certs/"
else
    warn "Skipping TLS cert — HTTPS will not work without openssl"
    warn "Install openssl and run: bash scripts/generate-self-signed-cert.sh"
fi

# ── Start services ────────────────────────────────────────────────────────────
step "4. Starting services..."
docker compose up -d --build
ok "Services started"

# ── Wait for backend health ───────────────────────────────────────────────────
step "5. Waiting for backend to become healthy..."
BACKEND_URL="http://localhost:8000/api/v1/status/health"
MAX_WAIT=60
for i in $(seq 1 $MAX_WAIT); do
    if curl -sf "$BACKEND_URL" >/dev/null 2>&1; then
        ok "Backend is healthy (took ~${i}s)"
        break
    fi
    if [ "$i" -eq "$MAX_WAIT" ]; then
        die "Backend did not become ready in ${MAX_WAIT}s. Run: docker compose logs backend"
    fi
    printf "\r  Waiting... (%ds)" "$i"
    sleep 1
done

# ── Run migrations ────────────────────────────────────────────────────────────
step "6. Applying database migrations..."
docker compose exec backend alembic upgrade head
ok "Migrations applied"

# ── Seed default users ────────────────────────────────────────────────────────
step "7. Seeding default users..."
docker compose exec backend python -m app.seed_run
ok "Default users created (or already exist)"

# ── Done ─────────────────────────────────────────────────────────────────────
ADMIN_PW="$(grep DFIR_DEFAULT_ADMIN_PASSWORD .env 2>/dev/null | cut -d= -f2 || echo '(see .env)')"

echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║          Setup complete! DFIR Kit is ready.           ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${BOLD}Access points:${NC}"
echo -e "    HTTPS (nginx):   ${CYAN}https://localhost${NC}  ${YELLOW}(accept self-signed cert)${NC}"
echo -e "    HTTP  (direct):  ${CYAN}http://localhost:5173${NC}"
echo -e "    API Docs:        ${CYAN}http://localhost:8000/docs${NC}"
echo ""
echo -e "  ${BOLD}Default credentials:${NC}"
echo -e "    Username:  ${CYAN}admin${NC}"
echo -e "    Password:  ${CYAN}${ADMIN_PW}${NC}"
echo ""
echo -e "  ${BOLD}Next steps:${NC}"
echo -e "    Build agent:     ${CYAN}make agent-all${NC}"
echo -e "    Agent config:    ${CYAN}make agent-config${NC}"
echo -e "    Seed demo data:  ${CYAN}make seed-demo${NC}"
echo -e "    View logs:       ${CYAN}make logs${NC}"
echo ""
echo -e "  ${BOLD}Forensics tools (optional, for full analysis):${NC}"
echo -e "    EZ Tools:        Configure path in Settings → Admin"
echo -e "    Hayabusa:        https://github.com/Yamato-Security/hayabusa"
echo -e "    Chainsaw:        https://github.com/WithSecureLabs/chainsaw"
echo ""
