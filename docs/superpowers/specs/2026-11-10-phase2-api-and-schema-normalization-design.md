# Phase 2: API Standardization & UX Hardening Design Document

**Status:** Approved  
**Author:** Multi-Agent Audit Taskforce  
**Target:** DFIR Rapid Collection Kit — Phase 2 Remediation  
**Date:** 2026-11-10  
**Branch:** `feat/phase2-api-and-schema-normalization`

---

## 1. Executive Summary

Phase 2 addresses critical architectural disconnects between the React frontend and FastAPI backend identified in the comprehensive codebase audit (`dfir_toolkit-code_review.md`):

1. **BE-GAP-03**: Five platform models (`CustomModule`, `AttackHypothesis`, `ScheduledCollection`, `ThreatHuntQuery`, `LegalHold`) were omitted from `backend/app/models/__init__.py::__all__`, exposing database schemas to accidental table drop migrations during Alembic autogenerate.
2. **BE-GAP-04**: The `UserUpdate` schema in `schemas/user.py` lacks a `password` field; administrator password resets initiated from the user management interface are silently ignored by `crud/user.py`.
3. **BE-GAP-06**: Device enrollment, modification, and deletion endpoints in `endpoints/devices.py` execute without generating cryptographic audit events.
4. **API Contract & Trailing Slashes (Section 4.4)**: Mutating requests (`POST`, `PUT`) without trailing slashes trigger `HTTP 307 Temporary Redirect` responses from FastAPI, breaking under CORS and proxy policies (`CreateIncident`, `Collectors`, `Devices`, `AdminSettings`, `IncidentTemplates`).
5. **Type Harmonization**: `frontend/src/types/dfir.ts` defines camelCase properties (`targetEndpoints`, `templateId`, `createdAt`), necessitating brittle, redundant mapper functions across dashboard pages.
6. **FE-GAP-05, FE-GAP-06, FE-GAP-07 (RBAC & Route Protection)**:
   - Routes `/admin/custom-modules`, `/agents/:agentId/console`, and `/incidents/:id/ai-analysis` lack `<RoleRoute>` guards.
   - Operators are shown mutating controls for Custom Modules and Scheduled Collections despite backend enforcement requiring `admin` role (`403 Forbidden`).
7. **FE-GAP-01, FE-GAP-02, FE-GAP-03, FE-GAP-04 (Frontend State & Scope Integrity)**:
   - `SIEMExport.tsx` calls a non-existent phantom route `/admin/settings` (fails 404).
   - `CollectionExecution.tsx` drops module selection on browser refresh when relying solely on `location.state`.
   - `EvidenceContext.tsx` stores pinned evidence in a global `localStorage` key without incident scoping, leaking evidence across unrelated incident cases.
   - `Collectors.tsx` terminal buttons attempt to open live console sessions against collector IDs rather than enrolled agent device IDs.

---

## 2. Architectural Design & Technical Specifications

### 2.1 Model Registry Completeness (BE-GAP-03)
- **Problem**: SQLAlchemy models declared in `app/models/platform_features.py` (`CustomModule`, `AttackHypothesis`, `ScheduledCollection`, `ThreatHuntQuery`, `LegalHold`) are not imported into `app/models/__init__.py` and are missing from `__all__`.
- **Solution**:
  - In `backend/app/models/__init__.py`:
    - Import `AttackHypothesis`, `CustomModule`, `LegalHold`, `ScheduledCollection`, `ThreatHuntQuery` from `app.models.platform_features`.
    - Append all 5 models to `__all__`.
  - Guarantees `Base.metadata` includes all table schemas whenever models are loaded by Alembic or runtime services.

### 2.2 User Password Management & Admin Reset (BE-GAP-04)
- **Problem**: Admin UI calls `PATCH /api/v1/users/{user_id}` with `{ password: "..." }`. The `UserUpdate` schema discards `password`, and `update_user` never updates `password_hash`.
- **Solution**:
  1. **Schema Update (`app/schemas/user.py`)**:
     - Add `password: str | None = None` to `UserUpdate`.
  2. **CRUD Logic (`app/crud/user.py`)**:
     - In `update_user()`, if `"password"` in `data` and `data["password"]`:
       ```python
       password = data.pop("password")
       if password and password.strip():
           user.password_hash = get_password_hash(password.strip())
       ```
  3. **Audit Event & Validation (`app/api/v1/endpoints/users.py`)**:
     - When an administrator updates a user password, emit audit event:
       ```python
       event_type="admin_password_reset"
       action="reset password"
       message=f"Password reset for user {user.username}"
       ```

### 2.3 Device Audit Logging (BE-GAP-06)
- **Problem**: `endpoints/devices.py` creates, updates, and deletes devices with zero calls to `safe_record_event()`.
- **Solution**:
  - Inject `current_user: User = Depends(get_current_user)` on device mutation endpoints.
  - Record structured audit events:
    - Enrollment: `event_type="device_enrolled"`, `action="enroll device"`, `target_id=device.id`.
    - Modification: `event_type="device_updated"`, `action="update device"`, `target_id=device.id`.
    - Deletion: `event_type="device_deleted"`, `action="delete device"`, `target_id=device.id`.

### 2.4 Trailing Slash Normalization & Client Safeguard (Section 4.4)
- **Problem**: Calling collection roots without trailing slashes triggers `HTTP 307` redirects.
- **Solution**:
  1. **Frontend Callers**:
     - `CreateIncident.tsx`: `apiPost("/incidents/", ...)`
     - `Collectors.tsx`: `apiPost("/collectors/", ...)`
     - `Devices.tsx`: `apiPost("/devices/", ...)`
     - `AdminSettings.tsx`: `apiPut("/settings/", ...)`
     - `IncidentTemplates.tsx`: `apiPost("/templates/", ...)`
     - `AdminSettings.tsx`: `apiPost("/users/", ...)`
  2. **API Client Safeguard (`frontend/src/lib/api.ts`)**:
     - In `request()`, normalize path: if the path targets a collection root without an ID or file extension and lacks a trailing slash, ensure trailing slash before issuing fetch.

### 2.5 Type Harmonization (`frontend/src/types/dfir.ts`)
- **Problem**: Types in `dfir.ts` mismatch backend snake_case JSON schemas, causing repetitive boilerplate mappers.
- **Solution**:
  - Standardize `Incident`, `Evidence`, `Collector`, `EvidenceFolder` with snake_case properties matching Pydantic output (`created_at`, `updated_at`, `target_endpoints`, `template_id`, `collected_at`, `incident_id`, `last_seen`).
  - Retain optional camelCase aliases (`createdAt?`, `targetEndpoints?`) so existing consumers compile cleanly without regressions.
  - Simplify `Dashboard.tsx` to directly consume API response models.

### 2.6 Route Protection & RBAC UI Consistency (FE-GAP-05, FE-GAP-06, FE-GAP-07)
- **Solution**:
  1. **`App.tsx`**:
     - Wrap `/admin/custom-modules` in `<RoleRoute roles={["admin"]}>`.
     - Wrap `/agents/:agentId/console` in `<RoleRoute roles={["admin", "operator"]}>`.
     - Wrap `/incidents/:id/ai-analysis` in `<RoleRoute roles={["admin", "operator"]}>`.
  2. **`CustomModules.tsx`**:
     - Set `const canEdit = role === "admin";` so operator accounts do not see non-functional create/edit/delete buttons.
  3. **`ScheduledCollections.tsx`**:
     - Guard delete actions with `role === "admin"`, matching backend authorization.

### 2.7 Frontend State, Scoping & Phantom Endpoint Fixes (FE-GAP-01, FE-GAP-02, FE-GAP-03, FE-GAP-04)
- **Solution**:
  1. **`SIEMExport.tsx` (FE-GAP-01)**:
     - Replace phantom route `/admin/settings` with `/settings/`.
  2. **`CollectionExecution.tsx` (FE-GAP-02)**:
     - Store selected module IDs in `sessionStorage` (`dfir_collection_${incidentId}_modules`) upon entry; reload from storage if `location.state` is null.
  3. **`EvidenceContext.tsx` (FE-GAP-03)**:
     - Scope pinned evidence by incident ID (storing records keyed by `incident_id` or providing an active incident filter).
  4. **`Collectors.tsx` (FE-GAP-04)**:
     - Remove the invalid agent console navigation button from collector nodes, or conditionally navigate only if collector corresponds to an enrolled agent device.

---

## 3. Verification & Compliance Criteria
- Backend test suite with pytest must pass 100%.
- Go agent test suite must pass 100%.
- Frontend typecheck (`npm run typecheck`), lint (`npm run lint`), tests (`npm run test`), and build (`npm run build`) must pass with 0 errors.
