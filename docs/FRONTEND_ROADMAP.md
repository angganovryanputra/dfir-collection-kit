# FRONTEND_ROADMAP.md - DFIR Rapid Collection Kit

## Phase 1: Security & Stability (Current Sprint)
**Objective**: Hardening the foundation and ensuring safe artifact rendering.

- **Security**: Implement `SafeText` to prevent XSS from evidence data.
- **Auth**: Add proactive session expiry detection and clean logout UI.
- **Stability**: Standardize `PageErrorBoundary` and `ApiErrorAlert`.
- **RBAC**: Harden frontend route guards and navigation based on JWT roles.

## Phase 2: Analyst Cockpit & Scalability (Next 30 Days)
**Objective**: Unified case management and handling large datasets.

- **UX**: Refactor `IncidentHub` to show "Detection Heatmap" and "Progress Overview" at a glance.
- **Performance**: Implement `tanstack/react-virtual` for the Super Timeline.
- **Workflow**: Collection Setup improvements (Refresh-safe state, Profile artifact previews).
- **Evidence**: Add "Provenance Breadcrumbs" to all file previews.

## Phase 3: Hunting & Intelligence (Next 60 Days)
**Objective**: Advanced analysis features and SIEM integration.

- **Threat Hunting**: Dedicated Sigma/YARA triage dashboard with analyst "Review" states.
- **MITRE Integration**: ATT&CK Matrix mapping of Sigma hits.
- **Global Search**: Search across all incidents, agents, and IOCs from any page.
- **Reporting**: HMAC-signed report preview and download workflow.

## Phase 4: Enterprise Maturity (Next 90 Days)
**Objective**: Multi-tenant features and customization.

- **Customization**: User-definable dashboard layouts.
- **Collaborative**: Real-time analyst presence and case commenting.
- **Accessibility**: Full WCAG 2.2 audit and remediation.
- **Mobile**: Responsive SOC-on-the-go views for mobile alerts.
