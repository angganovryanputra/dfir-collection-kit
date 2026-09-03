# Deep Gap Analysis — 3 September 2026

## Scope and conclusion

`GAP_ANALYSIS_2026-09-03.md` is implemented as written. Its only deliberately
unimplemented UX request is a browser evidence drop zone: the application
correctly keeps acquisition on the authenticated agent/job path so that file
size limits, hashing, safe extraction, lock markers, and chain-of-custody
events cannot be bypassed.

That report was a focused remediation list, not a complete production-readiness
assessment. This follow-up reviews the currently implemented backend routers,
Celery workflow, agent-command design, evidence/legal workflow, Docker/CI,
tests, and frontend UX. Findings below are **new** and should be planned before
describing the system as production-ready for sensitive, multi-analyst DFIR.

## Verification performed

- CodeGraph architecture exploration, followed by source-level tracing of API,
  worker, frontend, Docker, and CI contracts.
- Docker stack health and an authenticated evidence smoke test had passed before
  this review; the app was healthy at review time.
- Backend isolated database suite: 47 passing tests (previous implementation
  pass). Frontend lint, typecheck, unit suite, and build passed.
- `npm audit --omit=dev --json`: 0 production dependency advisories.
- Playwright discovers Chromium and mobile Evidence Vault workflows. Browser
  execution is configured in CI.

## Findings

### Critical — Viewers can transmit case data to external systems and LLMs

**Evidence.** Case-management endpoints use only `get_current_user`, with no
`require_roles`, at `backend/app/api/v1/endpoints/case_management.py:57`, `:99`,
`:148`, and `:187`. They transmit incident type, operator, target endpoints,
and detections to TheHive, Jira, and Slack. The evidence-aware AI endpoints
`/annotate`, `/summary/{incident_id}`, and `/query` likewise accept every
authenticated role at `ai_analysis.py:243`, `:292`, and `:365`; they send event
content to the configured LLM provider.

**Impact.** A read-only viewer can initiate external disclosure of sensitive
case/evidence metadata and consume paid AI capacity. There is no approval,
per-incident allowlist, data-classification gate, or consent record.

**Recommendation.** Require `operator`/`admin` at a minimum; preferably make
external export and AI invocation a privileged, auditable operation with an
incident-level disclosure policy, a preview/redaction step, and explicit
confirmation. Add role-denial and payload-redaction tests.

### High — Case integration export is not auditable and `/export/all` is unsafe with one AsyncSession

**Evidence.** Individual Case Management export functions do not call
`safe_record_event`; a repository search finds zero audit events in
`case_management.py`. `export_all` at lines 187–199 invokes three functions in
`asyncio.gather()` and passes the same request-scoped SQLAlchemy `AsyncSession`
to each. Each function calls `_incident_summary`, which executes database
queries.

**Impact.** External evidence disclosure lacks a durable chain/audit event.
Concurrent use of one `AsyncSession` can fail with asyncpg/SQLAlchemy
"operation already in progress" errors under load, yielding partial exports
without a reliable user-facing outcome record.

**Recommendation.** Read and validate the incident summary once before
fan-out, then run only HTTP calls concurrently; record a distinct audit event
for each requested destination including actor, incident, destination, result,
external ID, and correlation ID. Return a deterministic per-destination result
even when one service fails.

### High — Live agent commands are volatile and can execute after the analyst has timed out

**Evidence.** `agent_commands.py:36–41` stores pending commands, command-to-
agent mappings, and output queues solely in process memory. The timeout path in
the WebSocket handler (`:112–169`) removes subscriber state but does not remove
the corresponding entry from `_pending`; the poll endpoint at `:189–205` later
pops and returns it to the agent.

**Impact.** A command can run after the UI said it timed out; commands vanish
on backend restart and fail in horizontal deployment because an agent and
WebSocket may hit different processes. There is no durable command status,
cancel operation, result retention, output-size limit, or completion audit
event.

**Recommendation.** Persist commands and state transitions in PostgreSQL (or a
durable Redis stream), add expiry and cancellation checked by the agent before
execution, bind results to the original command/device, cap command and output
sizes, retain transcripts as audit evidence, and use a broker that supports
multi-instance delivery.

### High — Scheduled collections cannot run repeatedly and ignore endpoint OS

**Evidence.** The scheduler generates
`JOB-{incident_id}-SCHED-{schedule_id[:8]}` at `worker.py:356`; it has no run
nonce or timestamp. Re-running the same schedule tries to insert the same job
ID. The same function hard-codes `normalize_os_name("windows")` at `:338`,
instead of deriving a target device/platform.

**Impact.** The second run of a schedule can violate the job primary key or
silently fail; Linux/macOS schedules can be issued Windows module sets. The UI
promises recurring collection, but it has no per-run history or target/OS
selection to expose these failures.

**Recommendation.** Model schedule runs separately, generate a unique job ID
per due occurrence, select target devices and OS explicitly, use an atomic
lease/claim to prevent duplicate Beat workers, and display last result, next
run, target count, and failure reason. Add time-travel tests for two successive
runs and each supported OS.

### High — Custom Module Authoring is currently a catalog, not an agent capability

**Evidence.** `CustomModule` is defined and CRUD-managed in
`platform_features.py`, and the UI says it extends agent collection
(`frontend/src/pages/CustomModules.tsx:~120–190`). A repository-wide reference
search finds `CustomModule` only in the model, CRUD endpoint, and demo seed;
`app.core.modules.build_modules()` and Go agent execution do not load or
receive those database records.

**Impact.** An administrator can successfully create a module that is never
dispatched or executed. This is especially hazardous in an incident because
the UI reports authoring success but acquisition coverage has not changed.

**Recommendation.** Either label and hide the feature as an unavailable
catalog until supported, or implement a signed versioned module bundle:
admin approval, OS-specific argument-array schema (not shell text), agent
allowlist, module checksum/signature, job snapshot, execution result, and audit
trail. Add end-to-end tests that prove a selected custom module reaches exactly
one compatible agent.

### High — Legal Hold and analyst report notes are presentation metadata, not retention controls/evidence

**Evidence.** `LegalHold` is created/released/expired in
`platform_features.py` and `worker.py:368–398`, but references are otherwise
limited to its model, API, worker, and demo seed. There is no evidence-retention
or deletion gate that consults it. Meanwhile Incident Report notes explicitly
write only to browser storage at `frontend/src/pages/IncidentReport.tsx:102–111`
and render as "stored locally, not synced" at `:576–593`.

**Impact.** A legal hold does not technically prevent retention/purge actions,
and important analyst conclusions are neither shared nor immutable/audited.
Both undermine legal defensibility and continuity across browsers/devices.

**Recommendation.** Make retention/purge/export policy consult active holds
transactionally; never auto-expire a hold without a policy-approved workflow;
record all hold state changes in chain-of-custody/audit. Store report notes and
versioned report snapshots server-side with author, timestamps, evidence links,
and immutable export metadata.

### Medium — Forensic parsing can silently lose detections and provenance detail

**Evidence.** `artifact_parser_service.py` contains multiple broad exception
handlers that discard failures while reading Hayabusa/Chainsaw output and
building Sigma records (for example lines ~286–358). Per-tool results are
reduced to counts, and malformed output can be ignored without a processing-job
warning.

**Impact.** Analysts may interpret “zero detections” as a clean result even
when a parser, tool binary, rule mapping, or output file failed. This weakens
negative-evidence claims and makes pipeline troubleshooting difficult.

**Recommendation.** Persist per-tool invocation metadata: binary/rule version
and hash, command arguments, start/end time, exit code, stdout/stderr digest,
input count, output count, and explicit `PARTIAL`/`FAILED` phase status. Surface
these states in Collection Execution and Incident Report; test malformed and
missing-tool cases.

### Medium — Observability is insufficient for an asynchronous forensic platform

**Evidence.** The application uses standard logs and health checks, but no
Prometheus/OpenTelemetry/request-correlation implementation was found in
backend or frontend sources. Docker health reports liveness only.

**Impact.** Operators cannot reliably answer queue delay, parser failure rate,
agent upload throughput, export duration, authentication denials, or whether a
collection was delayed versus lost.

**Recommendation.** Add structured JSON logs with correlation IDs propagated
from incident/job/evidence IDs; expose protected metrics for HTTP, Celery,
upload, parser phase, scheduler, and export outcomes; add traces across API →
Celery → tool execution; define alerts and a dashboard/runbook.

### Medium — Test strategy does not yet cover the feature surface or recovery claims

**Evidence.** The backend suite has four test modules and the frontend has one
unit test file plus one Evidence Vault Playwright spec. CI validates build,
lint, database tests, and one browser journey, but has no tests for scheduled
re-runs, custom-module dispatch, live commands, external integration RBAC,
AI disclosure controls, legal holds, backup restore, or parser failure
semantics. Backup/restore is documented in scripts, but no automated restore
drill is present.

**Impact.** The most stateful and consequential workflows can regress while
the existing green pipeline remains green.

**Recommendation.** Add contract/integration tests with fake HTTP services,
an agent simulator, a deterministic clock, and disposable volumes. Add a
nightly isolated backup-restore drill and a test matrix for Windows/Linux/macOS
collection profiles.

### Medium — Existing UX exposes capability without lifecycle certainty

**Evidence.** Custom Module creation and Scheduled Collection creation show
success states but do not show deployment/version, compatible targets, run
history, or terminal failure reason. Incident Report allows note entry even
though it is local-only. Several custom form labels (for example Custom Module
fields) are visual labels without `htmlFor`/input IDs.

**Impact.** During response work, users can assume a feature has taken effect
when it has not; handoffs lose analyst notes; keyboard/screen-reader users have
inconsistent form semantics.

**Recommendation.** Use a consistent capability lifecycle UI:
Draft → validated → approved → deployed → executed → verified, with immutable
run IDs and visible failure states. Disable unavailable actions, explain why,
and apply labelled controls, focus management, responsive layouts, and loading/
empty/error states consistently across all forms.

### Conditional architecture gap — No tenancy/isolation model

**Evidence.** Core records and API filters use incident/user IDs but no
organization/tenant ID or data-access boundary. This is acceptable for a
single-organization deployment.

**Impact.** The current design is not safe to market as multi-tenant or to use
for segregated customer matters without row-level isolation, storage prefixes,
worker queue boundaries, key separation, and tenant-aware audit/export rules.

**Recommendation.** Explicitly document single-tenant scope now. If
multi-tenancy is required, create an architecture migration rather than adding
tenant filters incrementally.

## Prioritized implementation order

1. Lock down and audit external export/AI actions; add role and regression tests.
2. Replace volatile agent-command queues and implement command expiry/cancel/audit.
3. Fix scheduled run identity/OS targeting and make run history visible.
4. Either complete signed Custom Module dispatch or hide the feature.
5. Enforce Legal Hold and persist/report-note revisions.
6. Make parser failures explicit, then add metrics/tracing and workflow tests.
7. Establish backup-restore drills and decide/document tenancy scope.

## Items not treated as gaps in this review

- Production frontend dependency audit was clean at review time.
- The Evidence Vault raw browser upload remains intentionally excluded for
  provenance and chain-of-custody reasons; the authenticated agent upload path
  is the correct design boundary.
- The vendor JavaScript bundle is deliberately consolidated pending measured
  performance data; route-level splitting already exists.
