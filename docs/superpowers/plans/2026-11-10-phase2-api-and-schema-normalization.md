# Phase 2: API Standardization & UX Hardening Implementation Plan

**Goal:** Remediate all Phase 2 gaps (BE-GAP-03, BE-GAP-04, BE-GAP-06, Trailing Slashes, Type Harmonization, FE-GAP-01 through FE-GAP-07) using Subagent-Driven Development.

**Architecture:** Contract-First API design, strict Pydantic v2 validation, zero-redirect REST endpoints, incident-scoped UI state, and rigorous RBAC protection.

---

### Task 1: Backend Model Registration & Device Audit Logging

**Files:**
- Modify: `backend/app/models/__init__.py`
- Modify: `backend/app/api/v1/endpoints/devices.py`
- Test: `backend/tests/test_device_audit_and_models.py`

**Interfaces:**
- Consumes: `app.models.platform_features`, `app.services.audit_log_service.safe_record_event`
- Produces: Complete `__all__` exported models and immutable audit trail on device mutations.

- [ ] **Step 1: Write test for model export completeness and device audit events**
- [ ] **Step 2: Update `backend/app/models/__init__.py` to import and export all 5 platform models**
- [ ] **Step 3: Update `backend/app/api/v1/endpoints/devices.py` with `safe_record_event` calls**
- [ ] **Step 4: Run pytest and commit**
```bash
git add backend/app/models/__init__.py backend/app/api/v1/endpoints/devices.py backend/tests/test_device_audit_and_models.py
git commit -m "fix(backend): register platform models in __all__ and add device audit logging"
```

---

### Task 2: User Password Management & Admin Password Reset

**Files:**
- Modify: `backend/app/schemas/user.py`
- Modify: `backend/app/crud/user.py`
- Modify: `backend/app/api/v1/endpoints/users.py`
- Test: `backend/tests/test_user_password_update.py`

**Interfaces:**
- Consumes: `get_password_hash`, `UserUpdate.password`
- Produces: Functional admin password reset with cryptographic hashing and audit logging.

- [ ] **Step 1: Write unit tests for password update and hashing**
- [ ] **Step 2: Add `password: str | None = None` to `UserUpdate` in `schemas/user.py`**
- [ ] **Step 3: Update `crud/user.py:update_user` to hash `password` into `password_hash`**
- [ ] **Step 4: Update `endpoints/users.py:update_user_endpoint` to emit `admin_password_reset` audit event**
- [ ] **Step 5: Run pytest and commit**
```bash
git add backend/app/schemas/user.py backend/app/crud/user.py backend/app/api/v1/endpoints/users.py backend/tests/test_user_password_update.py
git commit -m "feat(users): support password reset in UserUpdate with hashing and audit logging"
```

---

### Task 3: Trailing Slash Normalization & Client Safeguard

**Files:**
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/pages/CreateIncident.tsx`
- Modify: `frontend/src/pages/Collectors.tsx`
- Modify: `frontend/src/pages/Devices.tsx`
- Modify: `frontend/src/pages/AdminSettings.tsx`
- Modify: `frontend/src/pages/IncidentTemplates.tsx`

**Interfaces:**
- Consumes: Zero-redirect REST contracts on collection roots
- Produces: Elimination of HTTP 307 redirects on mutating POST/PUT calls.

- [ ] **Step 1: Add trailing slash safeguard in `frontend/src/lib/api.ts`**
- [ ] **Step 2: Normalize mutating API calls in `CreateIncident`, `Collectors`, `Devices`, `AdminSettings`, `IncidentTemplates`**
- [ ] **Step 3: Verify frontend typecheck and commit**
```bash
git add frontend/src/lib/api.ts frontend/src/pages/CreateIncident.tsx frontend/src/pages/Collectors.tsx frontend/src/pages/Devices.tsx frontend/src/pages/AdminSettings.tsx frontend/src/pages/IncidentTemplates.tsx
git commit -m "fix(api): normalize trailing slashes on mutating routes and add client safeguard"
```

---

### Task 4: Type Harmonization in `types/dfir.ts` & Dashboard Alignment

**Files:**
- Modify: `frontend/src/types/dfir.ts`
- Modify: `frontend/src/pages/Dashboard.tsx`

**Interfaces:**
- Consumes: Backend snake_case schemas
- Produces: Direct model consumption in UI components without boilerplate mappers.

- [ ] **Step 1: Standardize `Incident`, `Evidence`, `Collector` types with snake_case and backward-compatible aliases**
- [ ] **Step 2: Update `Dashboard.tsx` to utilize unified types cleanly**
- [ ] **Step 3: Verify typecheck and tests pass, commit**
```bash
git add frontend/src/types/dfir.ts frontend/src/pages/Dashboard.tsx
git commit -m "refactor(types): harmonize dfir types with backend snake_case schemas"
```

---

### Task 5: Frontend Route Protection & RBAC UI Guarding

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/pages/CustomModules.tsx`
- Modify: `frontend/src/pages/ScheduledCollections.tsx`

**Interfaces:**
- Consumes: `RoleRoute`, `getStoredRole()`
- Produces: Consistent role enforcement preventing 403 Forbidden errors for operators.

- [ ] **Step 1: Wrap unprotected routes in `App.tsx` with appropriate `RoleRoute` components**
- [ ] **Step 2: Restrict edit/delete actions in `CustomModules.tsx` and `ScheduledCollections.tsx` to admin role**
- [ ] **Step 3: Verify typecheck and commit**
```bash
git add frontend/src/App.tsx frontend/src/pages/CustomModules.tsx frontend/src/pages/ScheduledCollections.tsx
git commit -m "feat(ui): enforce RoleRoute protection and restrict admin-only controls"
```

---

### Task 6: Frontend State, Scoping & Phantom Endpoint Fixes

**Files:**
- Modify: `frontend/src/pages/SIEMExport.tsx`
- Modify: `frontend/src/pages/CollectionExecution.tsx`
- Modify: `frontend/src/context/EvidenceContext.tsx`
- Modify: `frontend/src/pages/Collectors.tsx`

**Interfaces:**
- Consumes: `/settings/`, `sessionStorage`, incident-scoped `localStorage`
- Produces: Reliable page reload recovery, incident-scoped pinned evidence, valid endpoints.

- [ ] **Step 1: Fix phantom endpoint in `SIEMExport.tsx` (`/settings/`)**
- [ ] **Step 2: Add `sessionStorage` fallback for `selectedModuleIds` in `CollectionExecution.tsx`**
- [ ] **Step 3: Scope pinned evidence in `EvidenceContext.tsx` by incident ID**
- [ ] **Step 4: Clean up collector terminal button in `Collectors.tsx`**
- [ ] **Step 5: Verify typecheck, test, and commit**
```bash
git add frontend/src/pages/SIEMExport.tsx frontend/src/pages/CollectionExecution.tsx frontend/src/context/EvidenceContext.tsx frontend/src/pages/Collectors.tsx
git commit -m "fix(ui): resolve phantom route, reload state loss, and evidence scoping"
```

---

### Task 7: Phase 2 Full Regression Verification

**Files:**
- Run: Full backend, agent, and frontend test suites
- Produces: Clean green verification across entire codebase.

- [ ] **Step 1: Run backend test suite (`pytest`)**
- [ ] **Step 2: Run Go agent test suite (`go test ./...`)**
- [ ] **Step 3: Run frontend typecheck, linter, tests, and production build**
- [ ] **Step 4: Conduct Whole-Branch Review and fast-forward merge to `main`**
