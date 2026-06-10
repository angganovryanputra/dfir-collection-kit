# FRONTEND_AUDIT_REPORT.md - DFIR Rapid Collection Kit

## 1. Executive Summary
The DFIR Rapid Collection Kit frontend is a functional, visually cohesive React workspace using a "Tactical/Cyberpunk" aesthetic. It successfully implements complex forensic workflows including incident management, remote collection, and super-timelining. However, significant gaps exist in proactive security handling, scalability of large datasets (Timeline/Evidence), and unified analyst cockpit UX.

## 2. Frontend Architecture Review
- **Framework**: React 18 with Vite.
- **Routing**: React Router v6 with lazy-loading for all feature modules.
- **State Management**: TanStack Query v5 for server state, local state for UI transitions.
- **Styling**: Tailwind CSS + shadcn/ui.
- **API**: Centralized `fetch` wrapper in `api.ts` with basic retry logic and 401 handling.

### Route Map
- `/dashboard`: High-level overview.
- `/incidents/:id`: Incident Hub (Cockpit).
- `/incidents/:id/setup` & `/collect`: Collection workflow.
- `/evidence`: Evidence Vault.
- `/incidents/:id/super-timeline`: Advanced timeline exploration.
- `/admin/*`: System and user management.

## 3. Component Inventory Assessment
- **Common Components**: StatCard, TacticalPanel, TerminalLog are well-defined.
- **Gap**: Missing `SafeText` component for rendering untrusted artifact data.
- **Gap**: Fragmented Status/Severity badges; logic is often duplicated across pages.

## 4. Secure Frontend Assessment

### Auth/Session
- **JWT Storage**: Stored in `localStorage`.
- **Expiry Handling**: Reactive (waits for a 401). No proactive expiry warning or cleanup.
- **401/403 Handling**: Properly clears token on 401 and redirects to login with `from` state.

### Evidence Rendering
- **XSS Prevention**: `dangerouslySetInnerHTML` is avoided in core pages, but no enforced standard exists.
- **File Paths**: Rendered as raw strings; needs safe escaping and copy-friendly UI.

### Internal Data Leakage
- **Error Messages**: API errors are thrown as raw strings; potential for backend stack trace exposure if not normalized.

## 5. Analyst Workflow Gap Analysis
- **Incident Cockpit**: `IncidentHub` is good but requires more "Glanceable" data (e.g., total Sigma hits by severity in the header).
- **Timeline Scalability**: `SuperTimelineTable` uses `contentVisibility: auto`, which is a good start, but lacks true virtualization (React Virtual), causing lag on 10,000+ events.
- **Context Loss**: Navigating between "Setup", "Execution", and "Hub" can feel fragmented.

## 6. Accessibility & Performance
- **Contrast**: High contrast (Dark Mode only) is compliant for tactical use.
- **Keyboard**: Basic navigability exists via shadcn/ui.
- **Bundle Size**: ~1.2MB total, but lazy-loading brings initial load to ~250KB.

## 7. Prioritized Frontend Backlog

### P0 — Security & Correctness
- [ ] Implement `SafeText` component for all artifact rendering.
- [ ] Standardize `ApiErrorAlert` and normalization.
- [ ] Proactive session expiry check (JWT decode).
- [ ] Role-aware navigation hardening (Sidebar/Breadcrumbs).

### P1 — Analyst Productivity
- [ ] Refactor `IncidentHub` into a "Unified Cockpit".
- [ ] Implement `DataTable` virtualization for Super Timeline.
- [ ] Standardize `SeverityBadge` and `StatusBadge`.
- [ ] Improve Collection Setup UX (Profile previews + OS warnings).

### P2 — Product Maturity
- [ ] Global Command Palette (⌘K) for quick search.
- [ ] MITRE ATT&CK Matrix view.
- [ ] AI Summary formatting improvements.
