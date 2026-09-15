# Implementation Verification and Gap Analysis — 2026-09-04

## Delivered

- TLS development certificate and private key were rotated. Certificate paths
  are ignored, and the local Git pre-commit hook path is enabled through the
  tracked `.githooks/pre-commit` template.
- Docker uses a relative frontend API URL, a dedicated WebSocket proxy block,
  per-context `.dockerignore` files, a volume ownership init service, and a
  working `wget` healthcheck in the minimal frontend image.
- All parser outputs now cross a unified, backwards-compatible normalization
  boundary. It preserves original fields in `raw_data`, adds a stable event
  identity, performs stream deduplication, maps common Windows event IDs to
  MITRE, and extracts local observables without sending evidence externally.
- Super Timeline now supports filtered CSV, JSONL, CEF, LEEF 2.0, and STIX 2.1
  downloads. Cross-event correlations are available at
  `GET /processing/incident/{incident_id}/correlations`.
- The frontend exposes the new export formats without changing the existing
  theme or replacing the CSV workflow.

## Verification

| Check | Result |
| --- | --- |
| Frontend ESLint | Pass |
| Frontend TypeScript (`tsc --noEmit`) | Pass |
| Frontend production build | Pass |
| Backend Docker test suite | Pass — 51 tests |
| New schema/enrichment/export/correlation tests | Pass — 3 tests |
| Production Docker stack | Healthy after rebuild |
| HTTPS API health | Pass — `GET /api/v1/status/health` returned `{"status":"ok"}` |

## Remaining gaps and required operational actions

### Critical: remove historic private-key blobs from Git

`nginx/certs/key.pem` is no longer tracked in the current tree and was
rotated, but `git log --all -- nginx/certs/key.pem` still finds historic
commits. `git-filter-repo` is not installed in this workspace. History rewrite
must be performed from a fresh clone, then force-pushed only after coordinating
with all collaborators. It is intentionally not run against this dirty shared
working tree because it rewrites every local ref and can invalidate others'
work.

Recommended controlled procedure:

```powershell
pip install git-filter-repo
git filter-repo --path nginx/certs/key.pem --invert-paths --force
git push --force --all
git push --force --tags
```

Treat the old key as compromised until all reachable remote history, forks,
CI artifacts, and developer clones are remediated.

### Implemented: endpoint-specific rate limits

The global SlowAPI limit and login throttle are supplemented with explicit
per-IP, per-operation limits for evidence export, Super Timeline export/build,
correlations, processing triggers, and IOC bulk imports. The local fallback
does not depend on Redis, so it remains active during a broker outage. For a
multi-backend deployment, move these counters to Redis or the edge proxy.

### Verification requiring deployment credentials

The Nginx WebSocket proxy has the required upgrade headers and the healthcheck
passes, but an end-to-end WebSocket handshake still needs a valid short-lived
agent JWT. Run this during an authenticated agent-console acceptance test.

### Operational reminders

- Install licensed parser binaries/rules as described in
  [FORENSICS_TOOLS.md](FORENSICS_TOOLS.md); empty tool directories correctly
  result in unavailable-tool errors rather than synthetic results.
- Use a CA-issued certificate and secret manager for an internet-facing
  deployment; the rotated certificate is development-only.
