# DFIR Rapid Collection Kit — Frontend

React 18 + TypeScript + Vite frontend for the DFIR Rapid Collection Kit platform.

## Tech Stack

- **React 18** with TypeScript
- **Vite** — build tool and dev server
- **Tailwind CSS** + **shadcn/ui** — component library (do not modify `src/components/ui/`)
- **TanStack Query v5** — server state and data fetching
- **React Router v6** — client-side routing

## Development

```bash
npm install
npm run dev       # Dev server on http://localhost:5173
npm run build     # Production build
npm run lint      # ESLint
```

### Environment

Create `.env` from the example:

```bash
cp .env.example .env
```

Set `VITE_API_BASE_URL` to point to the backend:

```bash
VITE_API_BASE_URL=http://localhost:8000/api/v1
```

> `VITE_API_BASE_URL` is baked into the build at compile time. For production Docker deployments, the Nginx container proxies `/api` to the backend, so the default value works without changes.

## Project Structure

```
src/
├── components/
│   ├── layout/       # AppLayout, AppSidebar
│   ├── ui/           # shadcn/ui — DO NOT MODIFY
│   ├── common/       # Shared: SearchInput, etc.
│   └── *.tsx         # Feature components (TacticalPanel, WarningBanner...)
├── pages/            # Route-level pages
├── hooks/            # Custom React hooks
├── lib/
│   ├── api.ts        # HTTP client (apiGet, apiPost, apiPatch, apiPut, apiDelete)
│   └── auth.ts       # Auth helpers, JWT decode
├── types/            # Shared TypeScript types
├── App.tsx           # Router and route definitions
└── main.tsx
```

## Key Patterns

### API Client

Use helpers from `src/lib/api.ts` — they inject the auth token automatically and redirect to `/login` on 401:

```typescript
import { apiGet, apiPost } from "@/lib/api";

const data = await apiGet<IncidentOut>(`/incidents/${id}`);
await apiPost("/incidents", payload);
```

### Auth State

Auth is stored in `localStorage` under key `dfir_auth` as `{ token: string }`. The JWT payload carries `sub` (username) and `role`. Use helpers from `src/lib/auth.ts`:

```typescript
import { getStoredAuth, decodeRole } from "@/lib/auth";

const auth = getStoredAuth();  // null if not logged in
```

### Route Protection

All authenticated routes are wrapped with `ProtectedRoute` in `App.tsx`. It reads `getStoredAuth()` and redirects to `/login` if no token is present.

### Incident Collection Flow

```
CreateIncident → /incidents/:id/setup (CollectionSetup)
               → /incidents/:id/collect (CollectionExecution)
```

`CollectionSetup` passes `{ selectedModuleIds: string[] }` via `location.state` to `CollectionExecution`.

## Production Build (Docker)

The production frontend uses a multi-stage Dockerfile:

1. `node:20-alpine` — runs `npm run build`, outputs to `dist/`
2. `nginx:1.27-alpine` — serves the `dist/` directory

Nginx is configured with:
- SPA fallback (`try_files $uri /index.html`)
- Security headers (CSP, X-Frame-Options, Permissions-Policy, etc.)
- Static asset caching (1-year for hashed assets)

The frontend container exposes port 80 internally, mapped to 5173 in Docker Compose.
