# Product & Engineering Roadmap — DFIR Rapid Collection Kit

**Date:** 2026-06-10 · Derived from [RND_AUDIT_REPORT.md](RND_AUDIT_REPORT.md) and [FEATURE_GAP_ANALYSIS.md](FEATURE_GAP_ANALYSIS.md).

## 30-Day (stabilize & close P1 backlog)

| Item | Why | Done when |
|---|---|---|
| CI pipeline (GitHub Actions): go build/vet/test, npm build/lint, pytest vs service postgres, black/isort | No CI exists; the test suite was silently broken for months | All four jobs green on PR |
| Go↔Python module-registry parity check in CI | Manual sync is the standing drift risk | CI fails on ID set mismatch |
| Celery beat executor for `ScheduledCollection` | Feature is model+CRUD only | Cron tick triggers collection; `last_run_at`/`next_run_at` maintained; audit event |
| Legal-hold auto-expiry job | Retention promised but not enforced | Past-`expires_at` holds auto-release with audit event |
| Backup/restore runbook + `make backup` (pg_dump + evidence volume) | No documented DR | Restore drill executed once |
| README macOS status correction; document `MISP_VERIFY_TLS`/`THEHIVE_VERIFY_TLS` in `.env.example` | Doc drift | Docs match code |

## 60-Day (complete partial features & test depth)

| Item | Why | Done when |
|---|---|---|
| Go agent live-command support (poll loop + result POST with `X-Agent-Token`) | Backend+UI exist; agent side missing | UI command round-trips to a real agent; audited |
| Upload-pipeline integration test (synthetic ZIP → extract → hash → CoC → LOCKED) | Highest-value untested forensic path | Deterministic pytest in CI |
| Playwright E2E happy path (login → incident → profile → mock collect → timeline) | Zero frontend tests | Headless run in CI |
| Settings UI for integrations (TheHive/Jira/Slack/VT/MISP) with masked secrets | Env-only config blocks operators | Configurable + test-connection buttons |
| Structured JSON logging with request IDs; surface Celery queue depth in `/status/diagnostics` | Observability gap | Logs greppable by request/job ID |
| macOS agent distribution (`make darwin`, add `macos` to `_VALID_OS`) | 17 modules exist but binary can't be downloaded | macOS binary downloadable from UI |
| Log rotation + evidence-volume disk monitoring alert | Ops gap | Warning surfaced in UI below threshold |

## 90-Day (hardening & scale)

| Item | Why | Done when |
|---|---|---|
| Per-agent enrollment tokens (replace fleet-wide shared secret), token rotation | Top accepted risk | Each agent has revocable identity |
| Redis-backed JWT revocation + login rate limit | Enables multi-replica backend | Backend scales to 2+ replicas |
| Parser retry/backoff + dead-letter queue with UI visibility | Pipeline reliability | Transient failures self-heal; permanent ones visible |
| AI: structured row-level evidence citations + optional redaction before external LLM calls | Forensic explainability | Summary cites event IDs; PII redaction toggle |
| Browser-artifact parsing (Chrome/Edge/Firefox/Safari history → timeline) | Biggest KAPE coverage delta | Browser events searchable in super timeline |
| macOS TCC.db + FSEvents modules | Highest-value macOS gaps | Modules in both registries |
| Report templates (per incident type) | Reporting flexibility | Template selectable at generation |
| DuckDB timeline perf benchmark (10 M+ events) + index/partition tuning | Scale confidence | p95 query < 2 s at 10 M events |

## Future / Enterprise

- mTLS agent transport + signed agent binaries + auto-update channel
- Multi-tenancy (org/case isolation), SSO (OIDC/SAML)
- STIX/TAXII 2.1 import/export; IOC feed scheduler
- Fleet-scale hunts: scheduled hunt queries across all incidents with diffing
- Continuous endpoint monitoring (Velociraptor-style standing queries) built on the live-command channel
- ML-assisted triage scoring; anomaly detection over super timelines
- Object-lock (WORM) evidence storage backend; `chattr +i` local option
- HA deployment reference (multi-replica backend, pgbouncer, Redis sentinel)
