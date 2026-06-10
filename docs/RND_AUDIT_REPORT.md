# R&D Engineering Audit Report — DFIR Rapid Collection Kit

**Date:** 2026-06-10 · **Auditor:** Autonomous engineering audit (Claude Code) · **Scope:** full repository
**Companion docs:** [FEATURE_GAP_ANALYSIS.md](FEATURE_GAP_ANALYSIS.md) · [DFIR_COLLECTION_COVERAGE_MATRIX.md](DFIR_COLLECTION_COVERAGE_MATRIX.md) · [SECURITY_ASSESSMENT.md](SECURITY_ASSESSMENT.md) · [ROADMAP.md](ROADMAP.md) · root [AUDIT_REPORT.md](../AUDIT_REPORT.md) (Mar 2026, 73 findings — most remediated)

---

## 1. Executive Summary

The DFIR Rapid Collection Kit is a **mature, near-production triage collection platform** with an unusually complete feature surface for its size: 131 collection modules across 3 OSes, a parsing/detection pipeline (EZTools-style artifact parsers, Sigma, YARA, IOC), DuckDB super-timelines with lateral-movement detection, hash-chained chain-of-custody **and** a separate hash-chained audit log, legal holds, case-management export, threat-intel enrichment, and LLM-assisted analysis.

This audit cycle found and **fixed**:

| # | Severity | Finding | Status |
|---|----------|---------|--------|
| 1 | **P0** | `/agent-commands/poll/{agent_id}` and `/agent-commands/result/{command_id}` were **completely unauthenticated** — anyone with network reach could steal queued live commands or forge command output to analysts | ✅ Fixed — both now require `X-Agent-Token` (constant-time compare) |
| 2 | **P0** | Path traversal in `/ai/summary/{incident_id}` and `/ai/query` — `incident_id` used raw in a filesystem path | ✅ Fixed — `_SAFE_ID_RE` validation (422 on violation) |
| 3 | **P1** | **Failed logins and RBAC permission denials were never persisted to the audit log in production** — `get_db` rolls back on the raised 401/403, discarding the flushed audit row. A tamper-evident audit log that silently drops security events is a forensic-soundness failure | ✅ Fixed — explicit `commit()` before raising in all 4 login-failure paths (`auth.py`) and in `require_roles` (`deps.py`) |
| 4 | **P1** | Live remote shell commands (agent-commands WS + REST) executed with **no audit trail** | ✅ Fixed — `agent.command.submitted` audit events on both paths |
| 5 | **P1** | `POST /threat-intel/enrich` skipped IOC value validation (only GET shortcuts validated) — unvalidated values flowed into outbound VirusTotal URL paths | ✅ Fixed — `_validate_ioc()` for hash/ip/domain/url |
| 6 | **P1** | TLS certificate verification **disabled unconditionally** (`verify=False`) for MISP and TheHive clients | ✅ Fixed — verification on by default; opt-out via `MISP_VERIFY_TLS` / `THEHIVE_VERIFY_TLS` |
| 7 | **P1** | Duplicate index definition in `models/super_timeline.py` (`index=True` + explicit `Index`) made `Base.metadata.create_all` fail on any fresh database — breaking the **entire test suite** and the documented `seed_run.py` fresh-install path | ✅ Fixed |
| 8 | **P1** | Backend test suite was 100 % broken: pytest-asyncio loop-scope mismatch, httpx ≥ 0.28 `AsyncClient(app=…)` removal, missing FK parents in fixtures, missing redirect-following | ✅ Fixed — **40/40 tests pass** |
| 9 | P2 | SQL built by f-string in AI NL-query (quote-escaped but fragile) | ✅ Hardened — parameterized `?` placeholders, LIMIT clamped to 100 |
| 10 | P2 | AI outputs lacked uncertainty framing | ✅ Fixed — `disclaimer` field ("requires analyst validation") on summary + query responses |

13 new regression tests added (`tests/test_platform_security.py`). The pre-existing test `test_rbac_audit.py::test_login_failure_records_audit` — which had been failing invisibly because the whole suite errored — now passes and **retroactively proves finding #3**.

**Overall verdict:** suitable for internal/lab deployment today; [ROADMAP.md](ROADMAP.md) lists what separates it from hardened production/enterprise use (per-agent identity, DB-backed scheduled collections, retention enforcement, observability).

---

## 2. Methodology

1. **Build & run validation** — `go build/vet/test ./...` (clean, 11 tests), `npm run build` (clean, 6.7 s), Docker Compose full stack boot (7/7 services healthy), backend pytest against live PostgreSQL.
2. **Code inspection** prioritized on the newest, least-audited routers (`agent_commands`, `ai_analysis`, `threat_intel`, `case_management`, `agent_binary`) plus infra (`nginx-ssl.conf`, `docker-compose.yml`), cross-referenced with the Mar 2026 root audit to avoid re-litigating remediated findings.
3. **Evidence-backed findings** — every finding cites file and function; every fix has a regression test or a documented validation command.
4. **Benchmarks** — NIST SP 800-86 lifecycle, NIST CSF 2.0, OWASP ASVS, and feature parity vs Velociraptor/KAPE/GRR/Timesketch/TheHive/Hayabusa.

## 3. Build & Run Validation Results

| Component | Command | Result |
|-----------|---------|--------|
| Agent (Go 1.23) | `go build ./... && go vet ./... && go test ./...` | ✅ clean, 11 tests pass |
| Frontend (React/TS/Vite) | `npm run build` | ✅ 6.7 s (warn: caniuse-lite 12 months old) |
| Backend tests | `DFIR_TEST_DATABASE_URL=… pytest` | ✅ 40 passed (was: 100 % broken before this audit) |
| Docker stack | `docker compose up -d` | ✅ 7/7 healthy (backend, frontend, nginx, db, redis, celery worker+beat) |
| Backend boot | `/api/v1/status/health` via nginx | ✅ 200, zero errors in logs |

## 4. Feature Inventory & DFIR Lifecycle Mapping

Full matrix in [FEATURE_GAP_ANALYSIS.md](FEATURE_GAP_ANALYSIS.md). Lifecycle coverage summary (NIST SP 800-86):

| Phase | Coverage | Key features |
|-------|----------|--------------|
| Collection | **Strong** | 131 modules, profiles (triage/ransomware/insider/full), parallel executor, memory acquisition, VSS, dry-run |
| Examination | **Strong** | Artifact parsers, hashing, extraction pipeline, evidence vault, CoC |
| Analysis | **Strong** | Super timeline (DuckDB), Sigma/YARA/IOC, lateral movement map, threat hunt queries, cross-incident correlation, AI annotation |
| Reporting | **Good** | PDF report generation (audited), SIEM/case-management export, signed export manifests; gap: no customizable report templates |

## 5. Architecture Findings

- **Layering is clean and consistently applied**: endpoints → crud → models, Pydantic schemas at the boundary, services for cross-cutting logic. RBAC via `require_roles()` dependency factory is enforced server-side.
- **Two independent hash chains** (Chain of Custody for evidence; Audit Log for system events) is a genuinely strong design — finding #3 above was the one crack in it, now sealed.
- **In-memory state risks** (P2, accepted for single-instance deployment): JWT revocation list, login rate limiter, and agent-command queues are all per-process dicts. Multi-replica deployment requires moving these to Redis (see §12).
- **Agent live-command feature is partial**: backend + UI exist, but the Go agent never polls `/agent-commands/poll` (verified by grep). Securing the endpoints (fix #1) broke nothing; completing the agent side is roadmapped (60-day).
- **Module registry duality** (Python `MODULE_REGISTRY` ↔ Go registry) is manually synchronized — currently in sync at 131/131 (verified Jun 2026), but a CI parity check is the standing recommendation.

## 6. Forensic-Soundness Scores (0–5)

| Area | Score | Notes |
|------|-------|-------|
| Acquisition method | 4 | Read-only artifact copies; VSS for locked files ($MFT/$UsnJrnl); WinPmem/AVML memory |
| Hashing strategy | 5 | SHA-256 of every file, `hashes.sha256` manifest, verified on export |
| Chain-of-custody | 5 | Hash-chained, sequence-numbered, `FOR UPDATE` serialized, 409 on corruption |
| Evidence immutability | 4 | `LOCKED` marker + immutable folder; FS-level enforcement is OS-dependent |
| Operator attribution | **5 (was 3)** | Fix #3/#4: failed logins, RBAC denials, AI generation, and live commands now all audited |
| Timestamp/timezone handling | 4 | TZ-aware UTC everywhere; DuckDB TIMESTAMPTZ; agent uses host clock (no NTP assertion) |
| ZIP-bomb / traversal defense | 5 | 50 GB cap, path-traversal checks, safe_join, validated IDs |
| Partial-failure handling | 4 | Best-effort executor (fails only if ALL modules fail); per-module warnings preserved |
| Legal hold | 4 | Model + endpoints + deletion block (409); retention expiry not auto-enforced |
| Repeatability | 4 | Profiles + module IDs recorded per job; agent version recorded |
| Target-system impact | 3 | Agent writes staging ZIP to target disk; per-module footprint not documented (90-day item) |
| Export integrity | 5 | HMAC-SHA256-signed export manifests keyed by `SECRET_KEY` |

All areas scoring < 4 have concrete fixes in [ROADMAP.md](ROADMAP.md).

## 7. Pipeline Findings

Agent Upload → Extract → Hash → CoC → Parse → Sigma/YARA/IOC → Timeline merge → DuckDB → Analytics → Report.

**Strengths:** async I/O throughout (`asyncio.to_thread` for sync FS work), Celery time limits (2 h hard / 110 min soft), DB rollback + file cleanup on failed upload ingest, per-phase `ProcessingJob` status rows, `FOR UPDATE SKIP LOCKED` job dispatch (no double-assignment), 50 GB ZIP caps both agent- and server-side.

**Gaps (P2, roadmapped):** no automatic retry/back-off for transient parser failures; no dead-letter visibility for Celery; dedup of re-uploaded identical evidence is by-hash detection only; no queue-depth metric exposed.

## 8. UX Findings

Strong: per-page error boundaries (19 routes), adaptive polling with backoff, ANALYSIS READY badges, IncidentHub command center, column-visibility persistence, zoom indicators, keyboard shortcuts, bulk incident close. Gaps (P2): integration settings (TheHive/Jira/Slack/VT/MISP) are env-var-only — no Settings UI section; no global empty-state guidance for first-run ("no agents enrolled yet" walkthrough); macOS missing from agent-binary download page.

## 9. AI Feature Findings

- Provider-agnostic (OpenAI-compatible) with DB-stored settings, masked keys, Google OAuth for Gemini.
- Fixed this cycle: path traversal (#2), parameterized context query, `disclaimer` field, audit logging of summary generation.
- Remaining (P2/P3): structured row-level citations (responses cite timestamps/hosts via prompt only); no redaction layer before sending evidence excerpts to external LLMs (only 200–300 char truncation); recommend an "external AI" warning banner when provider ≠ ollama.

## 10. Integration Findings

| Integration | Status | Notes |
|------------|--------|-------|
| VirusTotal | ✅ solid | v3 API, graceful unconfigured fallback; input validation added this cycle |
| MISP | ✅ solid | TLS verify now default-on (`MISP_VERIFY_TLS` opt-out) |
| TheHive / Jira / Slack | ✅ working | TLS fix for TheHive; env-var config only (move to Settings UI — P2) |
| SIEM export (Splunk HEC / Elastic / Timesketch) | ✅ working | allowlisted targets, URL/index validation |
| Timesketch service | ✅ | token masked in API responses |
| STIX/TAXII | ❌ absent | P3 roadmap |

## 11. Testing Gaps (remaining after this cycle)

- No frontend unit/E2E tests (P1 — highest-value gap; Playwright login→collect→timeline happy path recommended).
- No Go↔Python registry parity test in CI (P1, trivial to add).
- No upload-pipeline integration test exercising a real ZIP through extract→hash→CoC (P1).
- No load/perf tests for DuckDB timeline queries at >10 M events (P2).

## 12. Documentation Consistency

- `CLAUDE.md` states macOS fully implemented (17 modules) — **verified true** against `macos_modules.go` and `MODULE_REGISTRY`. If `README.md` still describes macOS as metadata-only, that section is stale (single-line fix).
- Root `AUDIT_REPORT.md` (Mar 2026) remediation claims spot-checked — consistent with code.
- `agent_binary.py` `_VALID_OS` lacks `macos` even though macOS modules exist — distribution gap, P2 (`make darwin` target + allowlist entry).

## 13. Prioritized Roadmap

See [ROADMAP.md](ROADMAP.md) (30/60/90-day + enterprise).

## 14. Risk Acceptance Items (owner decision required)

1. **Single shared `AGENT_SHARED_SECRET`** for all agents — any one compromised endpoint can impersonate all agents. Per-agent enrollment tokens + mTLS is the enterprise fix (90-day).
2. **In-memory revocation/rate-limit/command-queue state** — acceptable single-instance; blocks horizontal scaling.
3. **HTTP (non-TLS) listener kept intentionally** in nginx for lab same-origin convenience — disable for any non-lab deployment.
4. **LLM evidence egress** — evidence excerpts leave the enclave when a cloud AI provider is configured; legal/policy sign-off required per deployment.
5. **Legal-hold retention expiry not auto-enforced** — holds release manually; automated expiry job is roadmapped.
