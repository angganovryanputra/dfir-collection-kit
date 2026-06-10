# FRONTEND_COMPONENT_GUIDE.md - DFIR Rapid Collection Kit

## Core Principles
1. **Never** use `dangerouslySetInnerHTML` for any data derived from forensic artifacts.
2. **Always** use `SafeText` for event messages, file paths, and command lines.
3. **Always** include a `Loading` and `Empty` state for data-driven components.
4. **Prefer** TanStack Query for all server-side state.

## Reusable Components

### `SafeText`
Used for rendering untrusted artifact data.
```tsx
<SafeText 
  text={event.message} 
  monospace 
  truncate={200} 
  showCopy 
/>
```

### `StatusBadge`
Unified status for incidents, jobs, and agents.
- `status`: 'pending' | 'running' | 'complete' | 'failed' | 'locked'

### `SeverityBadge`
Used for threat detections and timeline alerts.
- `severity`: 'informational' | 'low' | 'medium' | 'high' | 'critical'

### `ApiErrorAlert`
Displays normalized API errors.
```tsx
<ApiErrorAlert error={query.error} />
```

### `DataTable`
Wrapper around shadcn/ui table with built-in pagination and virtualization support.

## Role-Based Rendering
Use `getStoredRole()` from `@/lib/auth` to conditionally render UI elements.
- **Admin**: System settings, User management.
- **Operator**: Incident creation, Collection execution.
- **Viewer**: Read-only access to hub, evidence, and timeline.
