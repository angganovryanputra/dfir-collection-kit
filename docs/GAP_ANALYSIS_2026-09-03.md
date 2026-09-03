# Gap Analysis — 3 September 2026

## Implementation update

- `docker-compose.test.yml` provides an ephemeral PostgreSQL test stack with no production volumes or host ports. Run `docker compose -f docker-compose.test.yml up --build --abort-on-container-exit --exit-code-from backend_test`.
- Frontend now provides `npm run test` (Vitest/Testing Library) and `npm run test:e2e` (Playwright; requires `E2E_ADMIN_PASSWORD` and a demo stack). CI runs the unit suite.
- Demo seed adds two small, non-sensitive, hash-verified artifacts. Evidence details and signed export can be exercised after restarting a demo stack.
- Evidence Vault provides a collection CTA for an empty case, responsive full-screen details on mobile, and a filterable persistent local transfer-activity history with success/error notifications.

## Completed in this pass

- Evidence Vault now uses the paginated `GET /evidence/items` contract (`items` and `total`) and always filters it with an incident ID, not a folder ID.
- Evidence detail, explicit download, case export, and visible error feedback are available in the Evidence Vault UI.
- The legacy incident evidence endpoint correctly unpacks its `(items, total)` CRUD result.
- Event Inspector can be collapsed and expanded without losing the selected event.
- The Vite alias is compatible with Vite's forthcoming native config loader.

## Current status

All items in the original gap list below are closed or intentionally bounded.

- **Isolated backend tests:** `docker-compose.test.yml` creates a throwaway PostgreSQL database with no host port or production volume. The database-backed suite passes 47/47 there; CI already provides equivalent PostgreSQL and Redis services.
- **Frontend and browser tests:** Vitest validates the paginated Evidence Vault response contract. Playwright validates login, demo evidence discovery, and the evidence-details dialog. The Chromium workflow runs in CI against seeded demo data.
- **Executable demo evidence:** the demo seed writes harmless text/JSON fixtures, their SHA-256 hashes, and matching `HASH_VERIFIED` records, so download and signed case export are testable after a normal demo-stack restart.
- **UX/accessibility:** the no-data collection CTA, responsive mobile details sheet, Escape handling, focus trap, persistent filterable activity history, success/error notifications, and Timeline Inspector collapse control are implemented. Login inputs now have programmatic labels.
- **Evidence ingestion boundary:** acquisition deliberately remains an authenticated agent/job workflow, rather than a browser drop zone. It applies the configured size limit, safe ZIP extraction, hashing, chain-of-custody events, lock marker, and processing pipeline. A raw browser upload would bypass endpoint identity and weaken provenance.
- **Quality and delivery:** lint and TypeScript now pass with no diagnostics. The production build passes. Docker and CI use Node 22, matching current frontend test-tool engine requirements. Route-level splitting is active; the approximately 235 KB gzip vendor bundle remains consolidated to preserve React initialization order until real-user performance data justifies a safe split.

## Historical baseline (resolved)

### High — integration-test database is not provisioned by default

The backend suite requires `DFIR_TEST_DATABASE_URL`. Without it, database-backed tests are skipped (10 tests in the current local run). Add a disposable PostgreSQL service or a Compose test profile, and run it in CI; never point this variable at the production database because the fixtures clear all tables.

### Medium — no frontend component or end-to-end test command

`frontend/package.json` currently provides build and lint commands only. Add Vitest + Testing Library for response-contract/error-state tests, and Playwright/Cypress for login, Evidence Vault selection/detail/download-error, SuperTimeline collapse, and responsive layouts.

### Medium — mock evidence is metadata-only

The demo case exposes folders but currently has zero evidence items and no downloadable payload. This is correct for an empty mock case, but it cannot exercise the complete UI download path. Provide a small, non-sensitive fixture ZIP and a matching evidence record solely in the demo seed.

### Low — lint warnings still need a cleanup pass

`npm run lint` reports 17 warnings. The actionable ones are hook dependency warnings in Admin Settings, Dashboard, Login, and SuperTimeline; they can cause stale data after state changes. Fast-refresh export warnings in shared UI modules are development-only.

### Low — initial frontend payload is still substantial

The production build's shared vendor bundle is about 234 KB gzip. It is intentionally consolidated to prevent a React initialization-order failure. Measure real-user loading before splitting it; any split must preserve React's load order.

## UX next steps

1. Add an evidence upload/drop-zone flow with size, hash-progress, and malware-scan status.
2. Add a no-data call-to-action in demo mode that explains why there are no artifacts and links to a sample collection.
3. Make right-side detail panels responsive: use a full-screen sheet on narrow viewports and retain focus inside the panel.
4. Add a persistent, queryable activity toast/history for export and download jobs.
