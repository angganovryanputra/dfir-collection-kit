#!/usr/bin/env bash
# Create a portable backup of PostgreSQL metadata and the evidence volume.
# Run from the repository root after `docker compose up -d`.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STAMP="$(date -u +"%Y%m%dT%H%M%SZ")"
DESTINATION="${1:-$ROOT/backups/$STAMP}"

mkdir -p "$DESTINATION"
cd "$ROOT"

: "${POSTGRES_USER:=dfir}"
: "${POSTGRES_DB:=dfir}"

echo "[1/2] Exporting PostgreSQL database..."
docker compose exec -T db pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom \
  > "$DESTINATION/postgres.dump"

echo "[2/2] Archiving evidence volume..."
VOLUME_ID="$(docker volume ls --filter "label=com.docker.compose.volume=dfir_evidence" --format '{{.Name}}' | head -n 1)"
if [[ -z "$VOLUME_ID" ]]; then
  echo "[ERROR] Evidence volume is not present. Start the stack first." >&2
  exit 1
fi

docker run --rm \
  --mount "type=volume,src=$VOLUME_ID,dst=/source,readonly" \
  --mount "type=bind,src=$DESTINATION,dst=/backup" \
  alpine:3.20 tar -C /source -czf /backup/evidence.tar.gz .

sha256sum "$DESTINATION/postgres.dump" "$DESTINATION/evidence.tar.gz" > "$DESTINATION/SHA256SUMS"
echo "[OK] Backup written to $DESTINATION"
