# Workflow Audit — 2026-09-03

## Result

The application workflow is structurally connected end-to-end and the critical
state-handling defects found in this audit have been fixed. The Docker stack
builds and exposes a healthy API after the changes.

## Verified flow

1. An operator creates an incident, configures collection, and opens the
   collection execution screen.
2. The backend creates one job per selected target (or one fallback job).
3. Agents upload evidence; the vault creates folders, evidence items, a hash
   manifest, lock marker, chain-of-custody entry, and audit events.
4. A completed collection job can start the parsing pipeline.
5. A completed parsing job can build the Super Timeline.
6. The timeline, forensic detections, evidence folders, and report routes all
   use the same incident identifier and protected API routes.

## Fixes applied during audit

| Finding | Resolution |
| --- | --- |
| Agent reports `complete`, demo data uses `done`, but processing accepted only `completed`. | Centralized normalized successful and terminal job statuses. Processing now accepts all supported forms. |
| Completed demo jobs counted against the active-job concurrency cap. | Concurrency query now excludes every normalized terminal status. |
| The first finished target marked a multi-host incident complete. | Incident completion now waits for every collection job to become terminal; any final failed target sets collection failed. |
| S3 upload worker did not synchronize the parent incident state. | S3 success and failure paths now use the same aggregate collection-state synchronizer. |
| Revisiting an active collection could reset logs and chain-of-custody records. | The collection start endpoint is idempotent while jobs exist, and completed/failed collections reject an unsafe restart. |
| Mock-active seed used lifecycle values outside the API schema. | Replaced `COLLECTING` and `ANALYZING` with official collection statuses. |

## UX changes

- The header now contains an active-case selector. It remembers the selected
  case for the browser session and routes the Evidence Vault to that case.
- Incident Cockpit now shows a responsive Collection → Processing → Timeline
  → Report rail. Each step displays its actual prerequisite state and only
  exposes available actions.
- The collection step sends a new case to setup rather than accidentally
  starting collection from the workflow rail.

## Validation performed

- Frontend ESLint: passed.
- Frontend TypeScript type check: passed.
- Frontend production build: passed.
- Isolated Docker backend suite: **48 passed**.
- Active Docker services: healthy; `GET /api/v1/status/health` returned
  `{"status":"ok"}`.

## Remaining operational validation

The test environment proves API and state transitions, but it cannot prove an
actual endpoint acquisition without a registered agent and real artifact data.
Before production use, run one controlled collection against a non-production
host and verify: agent check-in, ZIP upload (or S3 completion), hash manifest,
chain-of-custody entries, processing status, Super Timeline build, and report
export. Timeline bookmarks/tags and report notes are still browser-local; they
are not yet shared, server-audited investigation annotations.
