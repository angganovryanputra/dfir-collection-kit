# Changelog

## 2026-09-03 — Timeline hardening and SIEM interoperability

- Normalized parser output into a backwards-compatible unified timeline schema
  with deterministic event identities, local enrichment, and deduplication.
- Added read-only cross-event correlations for failed/successful logons, audit
  log clearing, scheduled tasks, privileged group changes, and admin shares.
- Added filtered Super Timeline export formats: CEF, LEEF 2.0, and STIX 2.1.
- Documented external DFIR tool mounts and added a tracked private-key scanning
  pre-commit hook template.
