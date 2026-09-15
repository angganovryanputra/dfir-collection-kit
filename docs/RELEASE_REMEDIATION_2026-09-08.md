# Release remediation — 2026-09-08

This checklist tracks implementation and verification, not a claim that a
successful asset build certifies the application for forensic use.

## Implementation checklist

- [x] Evidence provenance, hash-verified resolution, isolated export caches
- [x] Frontend type checking, safe rendering, bounded adaptive polling
- [x] First Super Timeline build and actionable empty/error states
- [x] Explicit parser/analytics stage results, force/retry correctness
- [x] Collision-free parser outputs and version-aware Sigma adapters
- [x] Lossless event identity, structured hashes, authoritative host metadata
- [x] Shared DuckDB location/schema for hunts, correlation and SIEM push
- [x] WebSocket session revalidation and committed command audit
- [x] Serialized, atomic Super Timeline builds and snapshot freshness
- [x] Whole-result histogram, DSL filters and explicit UTC controls
- [x] Persisted incident annotations and visible correlation coverage
- [x] Bounded timeline exports (streaming remains a scale follow-up)
- [x] Fresh-clone CI setup, release checks, licensing/contribution/security docs
- [x] Documented upgrade/backup/restore workflow (restore drill remains operational)
- [x] Regression tests, frontend checks, backend and Go tests
- [x] Docker integration and browser workflow verification

## Operations requiring explicit coordination

Git history contains a previously committed private key. Rewriting shared history,
rotating a deployed certificate, and force-pushing are not performed automatically.
Local environment/cache files previously committed must be removed from the Git
index before publication without deleting working files. No deployment or public
release is performed by this implementation task.

## Verification

Verified 2026-09-10/14: Docker backend integration `107 passed`; local backend `97 passed, 11 skipped` (database-only tests); frontend lint, typecheck, build and Vitest `5 passed`; Go `go test ./...` passed; Evidence Vault desktop/mobile browser flow passed; acceptance stack health and proxy port-preserving redirect passed. The extended Super Timeline browser flow still needs a final rerun after the layout fixes. Black/isort/flake8 report substantial pre-existing formatting debt and are not marked green. Public release also requires Git-index cleanup of previously committed environment/private-key material and a tested backup restore.
