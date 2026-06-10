# Security Assessment — DFIR Rapid Collection Kit

**Date:** 2026-06-10 · Companion to [RND_AUDIT_REPORT.md](RND_AUDIT_REPORT.md). Supersedes the security sections of root `AUDIT_REPORT.md` (Mar 2026) for current status.

## 1. Vulnerability Findings — This Cycle

| ID | Severity | Vulnerability | Evidence (file:function) | Exploitability | Impact | Remediation | Regression test |
|---|---|---|---|---|---|---|---|
| V-01 | **P0** | Unauthenticated agent-command queue: poll + result endpoints had no auth | `endpoints/agent_commands.py::poll_for_command`, `::post_command_result` | Trivial (any network client) | Steal queued analyst commands; forge command output (analyst deception); dequeue/DoS | `X-Agent-Token` required via `verify_agent_secret` (constant-time) | `tests/test_platform_security.py` (5 tests) |
| V-02 | **P0** | Path traversal via `incident_id` into evidence filesystem | `endpoints/ai_analysis.py::generate_summary`, `::nl_query` | Easy (authenticated user) | Open DuckDB files outside intended incident scope | `_validate_incident_id` (`^[A-Za-z0-9_\-]{1,128}$`, 422) | 2 tests |
| V-03 | **P1** | Security audit events silently lost: `get_db` rollback on raised 401/403 discarded flushed audit rows | `core/deps.py::require_roles`, `endpoints/auth.py::login` (4 failure paths) | N/A (integrity defect) | No forensic record of failed logins or permission denials — defeats tamper-evident audit design | Explicit `commit()` before raising in all 5 sites | `test_rbac_audit.py` (now passing) |
| V-04 | **P1** | Live remote-shell commands unaudited | `agent_commands.py::run_command_sync`, `::analyst_ws` | N/A | Untraceable remote execution on endpoints | `agent.command.submitted` audit events (REST + WS) | covered by suite |
| V-05 | **P1** | IOC values unvalidated in `POST /threat-intel/enrich` → outbound URL path manipulation | `threat_intel.py::enrich_ioc` | Moderate | Malformed outbound VT requests / API path traversal | `_validate_ioc` per type | 5 tests |
| V-06 | **P1** | TLS verification disabled (`verify=False`) for MISP and TheHive | `threat_intel.py::_misp_enrich`, `case_management.py::export_to_thehive` | MITM position required | Intercept API keys + incident data in transit | Default-on verification; `MISP_VERIFY_TLS` / `THEHIVE_VERIFY_TLS` opt-out | config-level |
| V-07 | P2 | f-string SQL in NL-query context fetch (quote-escaped) | `ai_analysis.py::nl_query::_get` | Low (escaped) | Defense-in-depth | Parameterized `?`; LIMIT clamped 1–100 | suite |

All V-01…V-07 are **remediated** in this cycle.

## 2. OWASP ASVS Mapping (current state)

| ASVS area | Status | Evidence |
|---|---|---|
| V2 Authentication | ✅ | bcrypt hashes; weak-default `SECRET_KEY` blocks startup (`_INSECURE_DEFAULTS`); login rate limit 20/60 s per IP w/ sweep; failed logins audited (V-03 fix) |
| V3 Session management | ✅ | JWT w/ expiry + `jti`; revocation on logout; revoked-jti check in `get_current_user` and WS handshake. ⚠️ revocation list is in-memory (single-instance only) |
| V4 Access control | ✅ | Server-side `require_roles()` on every mutating route; viewer/operator/admin; denials audited (V-03 fix); FE role-gating is cosmetic only (correct) |
| V5 Input validation | ✅ | Pydantic everywhere; safe-ID regexes for path-building params (incidents, hunt queries, correlation, AI — V-02 fix); IOC validation (V-05 fix); cron regex; SIEM target allowlist; DuckDB SQL blocklist + parameterization |
| V10 Malicious file upload | ✅ | ZIP traversal checks, 50 GB decompression cap (server) + 50 GB ZIP cap (agent), `safe_join`, SHA-256 manifest, LOCKED marker |
| V6/V9 Cryptography & communications | ✅ | HMAC-SHA256 export signing + webhook signing; TLS 1.2/1.3 nginx; outbound TLS verify default-on (V-06 fix). ⚠️ HTTP listener intentionally retained for lab |
| V7 Error handling & logging | ✅ | Hash-chained audit log; no silent excepts in audited paths; secrets masked in API responses (`***`) |
| V12 API security | ✅ | Explicit CORS method/header whitelists; security headers middleware (CSP, XFO, etc.); nginx rate-limit zones (api 60 r/s, auth 20 r/m, heavy 6 r/m) |
| V14 Configuration | ✅ | compose refuses unset `SECRET_KEY`; Redis requirepass; non-root containers, `no-new-privileges`, `cap_drop: ALL` |

## 3. API Security Review

- Authorization matrix spot-checked: all mutating endpoints carry `require_roles("admin","operator")` or stricter; `/status/diagnostics` admin/operator; `/health` is intentionally unauthenticated liveness.
- Agent-facing endpoints (`/agents/*` upload/poll, `/agent-commands/poll|result`) all require `X-Agent-Token` with `hmac.compare_digest` (V-01 closed the gap).
- WebSocket `/agent-commands/ws/{agent_id}` validates JWT from query param, checks revocation and role before accept.
- SSRF surface: outbound URLs are fixed-host (VT, Google OAuth, Slack webhook from env) or admin-configured (MISP/TheHive/Jira/SIEM with scheme validation + allowlists). Residual risk: an admin can point exports at internal hosts — accepted (admin is trusted tier).

## 4. Agent Security Review

- Auth: shared secret header, constant-time compare. **Known limitation:** single secret for the fleet — per-agent identity is the top enterprise roadmap item.
- Transport: HTTPS via nginx; agent should pin or verify CA in hardened deployments.
- Input handling: agent validates IDs in URL construction (`safeIDRe`); job state mutex-protected; ZIP closed before walk-error check; incomplete ZIPs removed.
- OPSEC: best-effort module execution, warnings for protected artifacts (TCC), VSS cleanup with 30 s timeout; staging ZIP written to target disk (documented impact).

## 5. Evidence Security Review

- Pipeline: upload → extract (traversal+bomb safe) → SHA-256 all files → `hashes.sha256` manifest → CoC append (hash-chained, `FOR UPDATE` serialized) → DB rows → `LOCKED` marker. DB failures roll back with file cleanup.
- Export: HMAC-signed manifests; download URLs validated client-side (`buildExportUrl` must start with `/`).
- Deletion: blocked (409) while an active legal hold exists.
- Residual: filesystem immutability relies on the LOCKED convention + container user separation, not OS immutable flags (P2: `chattr +i` / object-lock storage option).

## 6. Infrastructure Hardening Review

| Control | Status |
|---|---|
| Non-root containers (backend UID 1000, nginx frontend) | ✅ |
| `security_opt: no-new-privileges` + `cap_drop: ALL` | ✅ backend/celery/frontend |
| Redis AUTH (`requirepass`) | ✅ |
| Postgres password via env; compose refuses empty SECRET_KEY | ✅ |
| nginx TLS 1.2/1.3, strong ciphers, rate-limit zones, 10 g body cap | ✅ |
| HTTP listener (no redirect) | ⚠️ intentional for lab; disable in production |
| Healthchecks all services | ✅ 7/7 |
| Backup/restore procedure | ❌ documented gap (ROADMAP 30-day) |
| Log rotation / retention enforcement | ❌ gap (ROADMAP 60-day) |

## 7. Remediation Status Summary

- **This cycle:** 7/7 findings fixed, 13 regression tests added, full suite green (40 passed).
- **Mar 2026 root audit:** 73 findings — security-critical items verified remediated in code (seed passwords, HMAC export signing, JWT revocation, SQL injection in correlation, ZIP bombs, rate limiting, Docker hardening).
- **Open accepted risks:** shared agent secret; in-memory token revocation; lab HTTP listener; LLM evidence egress — see RND_AUDIT_REPORT §14.
