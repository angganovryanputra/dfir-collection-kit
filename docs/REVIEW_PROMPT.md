# DFIR Collection Kit — Code Review & Gap Analysis Prompt

> **Copy prompt di bawah ini dan paste ke LLM kamu (Codex, Claude, GPT-4, Cursor, dll)**

---

## Prompt untuk LLM

```
You are a senior DFIR (Digital Forensics & Incident Response) platform architect and security engineer. Perform a comprehensive code review and gap analysis of the DFIR Collection Kit project at D:\DFIRCollectionKit.

## PROJECT CONTEXT

This is a production-grade DFIR evidence collection and management system with:
- Backend: FastAPI (Python 3.12) + async SQLAlchemy + PostgreSQL + Redis + Celery
- Frontend: React 18 + TypeScript + Vite + Tailwind + shadcn/ui
- Agent: Go 1.23 (collection agent for Windows/Linux/macOS endpoints)
- 305 source files, 14 DB migrations, 18 API routers, 131 collection modules

## REVIEW SCOPE

Analyze the following areas and provide actionable findings:

### 1. SECURITY AUDIT
- Authentication & authorization (JWT, RBAC, session management)
- Input validation (SQL injection, XSS, path traversal, command injection)
- Evidence integrity (hash verification, chain of custody, tamper detection)
- API security (rate limiting, CORS, security headers, CSRF)
- Secrets management (environment variables, hardcoded secrets)
- Docker security (container privileges, network isolation)
- Dependency vulnerabilities (outdated packages, known CVEs)

### 2. CODE QUALITY & ARCHITECTURE
- Code organization and separation of concerns
- Error handling completeness (bare except, swallowed exceptions)
- Async/await correctness (blocking I/O in async context)
- Database query patterns (N+1 queries, missing indexes, unbounded queries)
- API design consistency (REST conventions, response schemas)
- Frontend state management (React Query usage, prop drilling, unnecessary re-renders)
- Go agent concurrency (goroutine leaks, race conditions, context cancellation)

### 3. FORENSICS PIPELINE CORRECTNESS
- EZTools integration (correct CLI args, output parsing, error handling)
- Sigma/Hayabusa/Chainsaw integration (rule paths, output formats)
- Timeline merge logic (schema normalization, timezone handling, dedup)
- DuckDB integration (query performance, memory management, WAL mode)
- Evidence upload flow (ZIP extraction, size limits, virus scanning)
- Collection module completeness (Windows/Linux/macOS coverage gaps)

### 4. PRODUCTION READINESS
- Monitoring & observability (structured logging, metrics, tracing)
- Backup & disaster recovery (DB backup, evidence volume backup)
- Scalability (connection pooling, worker concurrency, horizontal scaling)
- Configuration management (environment-specific settings, secrets rotation)
- Documentation (API docs, runbooks, deployment guides)
- CI/CD pipeline completeness (test coverage gates, security scans, deployment automation)

### 5. DFIR DOMAIN COMPLIANCE
- Chain of custody legal admissibility
- Evidence handling best practices (write-once, audit trails)
- Data retention policies
- Multi-tenancy isolation (if applicable)
- Export formats (STIX, MISP, CSV, JSON for legal proceedings)

### 6. MISSING FEATURES & GAPS
Compare against the project's own gap analysis and identify:
- Features marked as "future" or "TODO" in code
- Missing test coverage (unit, integration, e2e)
- Missing API endpoints (incomplete CRUD, missing filters)
- Missing frontend features (UI/UX gaps, missing pages)
- Missing agent modules (OS coverage gaps)
- Integration gaps (SIEM, SOAR, threat intel feeds)

## OUTPUT FORMAT

For each finding, provide:

### [SEVERITY] Finding Title
- **Location**: file:line
- **Category**: Security / Quality / Performance / Feature / Compliance
- **Description**: What the issue is
- **Impact**: What could go wrong
- **Recommendation**: How to fix it
- **Priority**: Critical / High / Medium / Low
- **Effort**: Small / Medium / Large

## DELIVERABLES

1. **Executive Summary**: Top 5 critical issues that need immediate attention
2. **Security Findings**: All security vulnerabilities ranked by severity
3. **Code Quality Issues**: Architecture and code quality improvements
4. **Missing Features**: Gaps compared to project roadmap and DFIR best practices
5. **Test Coverage Report**: What's tested, what's missing, coverage percentage estimate
6. **Dependency Report**: Outdated packages, known vulnerabilities, upgrade recommendations
7. **Action Plan**: Prioritized list of fixes with estimated effort

## CONSTRAINTS

- Be specific — cite exact file paths and line numbers
- Be actionable — provide code snippets for fixes
- Be realistic — consider this is a vibe-coded project with limited resources
- Prioritize — focus on critical security and data integrity issues first
- Consider the existing audit report at AUDIT_REPORT.md (73 findings already fixed)

## START POINTS

Begin your analysis by reading:
1. CODEX.md — Project overview and key patterns
2. AUDIT_REPORT.md — Previous audit findings (all fixed)
3. backend/app/main.py — Application entry point and middleware
4. backend/app/core/security.py — Security utilities
5. backend/app/api/v1/endpoints/evidence.py — Evidence handling
6. backend/app/services/artifact_parser_service.py — Forensics pipeline
7. agent/internal/jobs/executor.go — Agent job execution
8. frontend/src/lib/api.ts — Frontend API client
9. docker-compose.yml — Infrastructure configuration
10. .github/workflows/ci.yml — CI pipeline

Then explore deeper based on initial findings.
```

---

## 📋 Cara Pakai

### Codex CLI
```bash
cd D:\DFIRCollectionKit
codex
```
Paste prompt di atas ke Codex.

### Claude Code
```bash
cd D:\DFIRCollectionKit
claude
```
Paste prompt di atas ke Claude.

### Cursor IDE
Buka folder project, lalu `Ctrl+L` / `Cmd+L` dan paste prompt.

### ChatGPT / GPT-4
Paste prompt langsung ke chat.

---

## 🎯 Expected Output

LLM akan menghasilkan:

1. **Executive Summary** — 5 isu kritis yang perlu segera diperbaiki
2. **Security Findings** — Semua vulnerability dengan severity ranking
3. **Code Quality Issues** — Architecture dan code quality improvements
4. **Missing Features** — Gap analysis vs project roadmap
5. **Test Coverage Report** — Apa yang sudah di test, apa yang missing
6. **Dependency Report** — Outdated packages, known vulnerabilities
7. **Action Plan** — Prioritized fixes dengan estimated effort

---

## 💡 Tips untuk Hasil Terbaik

1. **Run the prompt in stages** — Jalankan per section jika token limit
2. **Ask for code snippets** — Minta contoh code untuk setiap fix
3. **Prioritize** — Minta LLM focus ke critical/high severity dulu
4. **Verify** — Cross-check findings dengan actual code
5. **Iterate** — Run follow-up prompts untuk deep-dive ke area spesifik

---

> **Note**: Prompt ini designed untuk comprehensive review. Jika token limit, break menjadi beberapa prompt terpisah (security only, code quality only, dll).
