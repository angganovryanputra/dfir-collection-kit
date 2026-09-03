# Docker Restore Runbook

1. Stop API and workers: `docker compose stop backend celery_worker celery_beat`.
2. Verify the backup checksum: `sha256sum -c SHA256SUMS` from the backup directory.
3. Restore metadata: `cat postgres.dump | docker compose exec -T db pg_restore -U dfir -d dfir --clean --if-exists`.
4. Restore `evidence.tar.gz` only after preserving the current evidence volume.
5. Restart services and verify the health endpoint, evidence hashes, and chain-of-custody signatures.

Perform a restore drill in an isolated environment before relying on a backup in an incident.
