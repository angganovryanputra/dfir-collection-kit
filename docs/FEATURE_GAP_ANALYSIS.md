# Feature Gap Analysis — DFIR Rapid Collection Kit

**Date:** 2026-06-10 · Companion to [RND_AUDIT_REPORT.md](RND_AUDIT_REPORT.md)

Status legend: ✅ implemented · 🟡 partial · ⛔ stub/absent. Lifecycle: C=Collection, E=Examination, A=Analysis, R=Reporting.

## 1. Feature Matrix

| Feature | Component | Status | Key paths | Lifecycle | Security relevance | Tests | Priority gap |
|---|---|---|---|---|---|---|---|
| Incident management + state machine | BE/FE | ✅ | `endpoints/incidents.py`, `pages/Dashboard.tsx`, `IncidentHub.tsx` | C–R | RBAC, legal-hold delete block | partial | P2: closure immutability not full freeze |
| Collection profiles (triage/ransomware/insider/full) | BE/FE/Agent | ✅ | `core/modules.py`, `CollectionSetup.tsx` | C | — | unit | — |
| Module registry (131: 67 win / 47 linux / 17 macos) | BE+Agent | ✅ | `core/modules.py` ↔ `agent/internal/modules/registry.go` | C | manual sync risk | unit (BE only) | P1: CI parity test |
| Parallel collection executor | Agent | ✅ | `internal/jobs/executor.go` | C | 50 GB ZIP cap | go test | — |
| Memory acquisition (WinPmem / AVML) | Agent | ✅ | `windows_memory.go`, `linux_memory.go` | C | privileged op | none | P2: integration test |
| Dry-run mode | Agent | ✅ | agent config | C | — | go test | — |
| Live agent commands | BE/FE only | 🟡 | `endpoints/agent_commands.py` | C | **was unauth (P0, fixed)**; now audited | 5 new tests | P1: Go agent side missing |
| Evidence upload/extract/hash/lock | BE | ✅ | `endpoints/agents.py`, `core/evidence_files.py` | E | traversal+bomb safe | partial | P1: end-to-end ZIP test |
| Chain of Custody (hash chain) | BE/FE | ✅ | `crud/chain_of_custody.py`, `ChainOfCustody.tsx` | E/R | tamper-evident, 409 on corruption | yes | — |
| Audit log (hash chain) | BE | ✅ | `services/audit_log_service.py` | R | **failure events were dropped (P1, fixed)** | yes | — |
| Processing pipeline (parse→sigma→yara→ioc) | BE/Celery | ✅ | `services/artifact_parser_service.py`, `worker.py` | E/A | timeouts, soft limits | partial | P2: retry/backoff |
| Super timeline (DuckDB) + export | BE/FE | ✅ | `services/super_timeline_service.py`, `SuperTimeline.tsx` | A | sort col allowlist | yes | P2: perf test >10M events |
| Lateral movement detection/map | BE/FE | ✅ | `LateralMovementMap.tsx` | A | — | none | P2 |
| Threat hunt query library | BE/FE | ✅ | `endpoints/platform_features.py`, `ThreatHuntLibrary.tsx` | A | SQL blocklist + safe IDs | unit | — |
| Cross-incident correlation | BE/FE | ✅ | `platform_features.py::correlate_timelines`, `CorrelationView.tsx` | A | parameterized, validated IDs | unit | — |
| ATT&CK hypotheses | BE/FE | ✅ | `HypothesisBuilder.tsx` | A | — | none | P3 |
| Legal holds | BE/FE | ✅ | `LegalHolds.tsx`, delete-block in `incidents.py` | R | deletion 409 | none | P1: auto-expiry job |
| Scheduled collections | BE model only | 🟡 | `ScheduledCollection` model + CRUD | C | cron validated | unit | P1: Celery beat executor missing |
| Custom modules | BE/FE | 🟡 | `CustomModules.tsx` | C | command field = remote exec by design (admin-only) | none | P2: agent-side execution + sandboxing policy |
| Threat intel (VT/MISP) | BE/FE | ✅ | `endpoints/threat_intel.py` | A | input validation + TLS (fixed) | 5 new tests | — |
| AI annotation/summary/NL-query | BE/FE | ✅ | `endpoints/ai_analysis.py`, `AIAnalysis.tsx` | A/R | traversal fixed; disclaimer added; audited | 3 new tests | P2: row-level citations, redaction |
| Case mgmt export (TheHive/Jira/Slack) | BE | ✅ | `endpoints/case_management.py` | R | TLS fixed | none | P2: Settings UI config + audit event |
| SIEM export (Splunk/Elastic/Timesketch) | BE | ✅ | `platform_features.py::siem_export` | R | allowlist + URL validation | unit | — |
| PDF report generation | BE | ✅ | `services/report_service.py` (weasyprint) | R | audited | none | P2: templates |
| Signed exports (HMAC) | BE | ✅ | `core/security.py::compute_export_signature` | R | keyed by SECRET_KEY | yes | — |
| Notifications (webhook, HMAC-signed) | BE | ✅ | `services/notification_service.py` | R | X-DFIR-Signature | yes | — |
| S3 archival (multipart) | BE | ✅ | `services/s3_service.py` | E | — | none | P2 |
| Agent binary distribution | BE/FE | 🟡 | `endpoints/agent_binary.py` | C | allowlisted os/arch, authed | none | P2: macOS missing from `_VALID_OS` |
| Auth (JWT + jti revocation + rate limit) | BE/FE | ✅ | `core/security.py`, `endpoints/auth.py` | — | login-failure audit fixed | yes | P2: revocation in Redis for HA |
| RBAC (admin>operator>viewer) | BE/FE | ✅ | `core/deps.py::require_roles` | — | denial audit fixed | yes | — |
| Users admin | BE/FE | ✅ | `endpoints/users.py` | — | admin-only | partial | — |
| Settings (masked secrets, TTL cache) | BE/FE | ✅ | `endpoints/settings.py` | — | token masking | partial | — |

## 2. Current vs Target State (themes)

| Theme | Current | Target |
|---|---|---|
| Agent trust | one shared secret | per-agent enrollment token, mTLS, binary signing |
| Scheduling | model + CRUD only | Celery-beat-driven scheduled collections with audit |
| Test depth | 40 BE unit/integration + 11 Go | + FE E2E, registry parity CI, pipeline integration |
| Observability | health checks + logs | structured JSON logs w/ request IDs, Prometheus metrics, queue depth |
| Retention | manual legal-hold release | automated expiry + retention policy engine |

## 3. Prioritized Backlog

### P0 — none open (both found this cycle were fixed same-day)

### P1
| Item | Complexity | Depends on | Acceptance criteria |
|---|---|---|---|
| Go agent support for live commands (`/agent-commands/poll` loop + result POST with X-Agent-Token) | M | fix #1 (done) | command round-trip from UI to agent shell visible in WS; audited |
| Celery beat executor for `ScheduledCollection` | M | — | enabled schedule creates a collection job within 1 min of cron tick; `last_run_at`/`next_run_at` updated |
| Legal-hold auto-expiry job | S | beat infra | hold with past `expires_at` transitions to EXPIRED; audit event recorded |
| CI parity test Go↔Python module registries | S | — | CI fails if module ID sets differ |
| Upload-pipeline integration test (real ZIP → extract → hash → CoC) | M | test DB | test asserts manifest, CoC entry, LOCKED marker |
| Frontend E2E happy path (Playwright) | M | — | login → create incident → select profile → mock collect → view timeline passes headless |

### P2
Settings UI for integrations (TheHive/Jira/Slack/VT/MISP) · macOS agent binary distribution (`make darwin`, `_VALID_OS`) · parser retry/backoff + dead-letter visibility · AI row-level citations + redaction · report templates · Redis-backed revocation/rate-limit for HA · README macOS status refresh · Prometheus metrics · DuckDB perf test.

### P3
STIX/TAXII export · fleet-scale hunt scheduling · ML triage scoring · multi-tenancy · advanced dashboards · agent auto-update channel.
