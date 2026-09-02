# CI/CD Pipeline — Panduan Vibe Coding

Dokumentasi lengkap cara menggunakan CI/CD pipeline DFIR Collection Kit untuk vibe coding dengan IDE atau AI LLM lainnya.

---

## 📋 Daftar Isi

1. [Arsitektur Pipeline](#arsitektur-pipeline)
2. [Quick Start](#quick-start)
3. [Vibe Coding dengan IDE](#vibe-coding-dengan-ide)
4. [Vibe Coding dengan AI LLM](#vibe-coding-dengan-ai-llm)
5. [Workflow Detail](#workflow-detail)
6. [Troubleshooting](#troubleshooting)

---

## 🏗 Arsitektur Pipeline

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        CI Pipeline (ci.yml)                                  │
│  Trigger: push ke main/develop, PR ke main/develop                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │  Backend     │  │  Backend     │  │  Go Agent    │  │  Frontend    │   │
│  │  Lint &      │  │  Tests       │  │  Lint &      │  │  Lint &      │   │
│  │  Security    │──│  (pytest)    │  │  Test        │  │  Build       │   │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘   │
│         │                  │                  │                  │          │
│         └──────────────────┴──────────────────┴──────────────────┘          │
│                                    │                                        │
│                                    ▼                                        │
│                          ┌──────────────┐                                   │
│                          │  Docker      │                                   │
│                          │  Build Test  │                                   │
│                          └──────────────┘                                   │
│                                    │                                        │
│                                    ▼                                        │
│                          ┌──────────────┐                                   │
│                          │  Integration │                                   │
│                          │  Smoke Test  │                                   │
│                          └──────────────┘                                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                        CD Pipeline (cd.yml)                                  │
│  Trigger: push ke main (staging), tag v*.*.* (production)                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │  Build &     │  │  Security    │  │  Deploy      │  │  Deploy      │   │
│  │  Push Images │──│  Scan        │──│  Staging     │──│  Production  │   │
│  │  (ghcr.io)   │  │  (Trivy)     │  │  (auto)      │  │  (manual)    │   │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Quick Start

### 1. Setup GitHub Secrets

Buka **Settings → Secrets and variables → Actions** dan tambahkan:

| Secret | Description | Required |
|--------|-------------|----------|
| `GITHUB_TOKEN` | Auto-generated | ✅ |
| `STAGING_HOST` | Staging server IP/hostname | For CD |
| `STAGING_SSH_USER` | SSH username for staging | For CD |
| `STAGING_SSH_KEY` | SSH private key for staging | For CD |

### 2. Aktifkan GitHub Actions

1. Buka tab **Actions** di repository
2. Klik **I understand my workflows, go ahead and enable them**
3. Workflows akan otomatis aktif untuk push dan PR

### 3. Branch Protection (Recommended)

Buka **Settings → Branches → Add rule** untuk `main`:

- ✅ Require a pull request before merging
- ✅ Require status checks to pass before merging
- ✅ Select checks: `backend-lint`, `backend-test`, `agent-lint-test`, `frontend-lint-build`

---

## 💻 Vibe Coding dengan IDE

### VS Code Setup

#### Extensions yang Direkomendasikan

```json
// .vscode/extensions.json
{
  "recommendations": [
    "ms-python.python",
    "ms-python.black-formatter",
    "ms-python.isort",
    "ms-python.flake8",
    "ms-vscode.vscode-typescript-next",
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "golang.go",
    "ms-azuretools.vscode-docker",
    "github.vscode-github-actions"
  ]
}
```

#### Settings untuk Format on Save

```json
// .vscode/settings.json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "ms-python.python",
  "[python]": {
    "editor.defaultFormatter": "ms-python.black-formatter",
    "editor.codeActionsOnSave": {
      "source.organizeImports": true
    }
  },
  "[javascript][typescript][typescriptreact]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "[go]": {
    "editor.defaultFormatter": "golang.go"
  }
}
```

#### Pre-commit Hook (Opsional)

```bash
# Install pre-commit
pip install pre-commit

# Buat .pre-commit-config.yaml
cat > .pre-commit-config.yaml << 'EOF'
repos:
  - repo: https://github.com/psf/black
    rev: 24.1.1
    hooks:
      - id: black
        language_version: python3.12

  - repo: https://github.com/pycqa/isort
    rev: 5.13.2
    hooks:
      - id: isort

  - repo: https://github.com/pycqa/flake8
    rev: 7.0.0
    hooks:
      - id: flake8

  - repo: https://github.com/dominikh/staticcheck
    rev: 2024.1.1
    hooks:
      - id: staticcheck
        files: \.go$
EOF

# Install hooks
pre-commit install
```

### JetBrains (PyCharm / IntelliJ / GoLand)

1. **Black Integration**:
   - Settings → Tools → Black
   - Enable "On code reformat"
   - Set path to Black binary

2. **isort Integration**:
   - Settings → Tools → isort
   - Enable "On code reformat"

3. **File Watchers**:
   - Settings → Tools → File Watchers
   - Add watchers for Black, isort, ESLint

---

## 🤖 Vibe Coding dengan AI LLM

### Claude Code (Recommended)

#### Setup

```bash
# Install Claude Code
npm install -g @anthropic-ai/claude-code

# Login
claude login

# Mulai vibe coding
cd D:\DFIRCollectionKit
claude
```

#### Contoh Prompt untuk Vibe Coding

```
# Buat fitur baru
"Buat endpoint API untuk export evidence ke format STIX 2.1"

# Fix bug
"Fix bug di timeline builder yang crash saat EVTX file corrupt"

# Refactor
"Refactor pipeline service untuk support plugin architecture"

# Testing
"Buat integration test untuk full collection workflow"

# Security
"Add input validation untuk custom module command execution"
```

#### Claude Code + CI/CD Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│                    Vibe Coding Workflow                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. Buat branch baru                                            │
│     git checkout -b feature/stix-export                         │
│                                                                 │
│  2. Vibe coding dengan Claude                                  │
│     claude → "Buat STIX export endpoint"                        │
│                                                                 │
│  3. Commit & push                                               │
│     git add . && git commit -m "Add STIX export"                │
│     git push origin feature/stix-export                         │
│                                                                 │
│  4. CI otomatis jalan                                           │
│     ✅ Backend lint (Black, isort, Flake8, Bandit)              │
│     ✅ Backend tests (pytest, coverage ≥ 70%)                   │
│     ✅ Go agent lint & test                                     │
│     ✅ Frontend lint & build                                    │
│     ✅ Docker build test                                        │
│     ✅ Integration smoke test                                   │
│                                                                 │
│  5. Buat Pull Request                                          │
│     → GitHub Actions status checks harus hijau                   │
│                                                                 │
│  6. Merge ke main                                               │
│     → CD pipeline deploy ke staging otomatis                    │
│                                                                 │
│  7. Tag release                                                 │
│     git tag v1.2.0 && git push origin v1.2.0                    │
│     → CD pipeline deploy ke production                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Cursor IDE

#### Setup

1. Install Cursor dari https://cursor.sh/
2. Buka folder project `D:\DFIRCollectionKit`
3. Settings → Features → Enable "Copilot"

#### Contoh Prompt (Cursor Chat)

```
@code Buat fungsi untuk detect C2 beaconing pattern di network logs

@docs Generate API documentation untuk evidence endpoints

@terminal Run pytest dengan coverage report

@git Buat commit message untuk changes ini
```

#### Cursor + CI/CD Workflow

```
1. Buka Cursor di folder project
2. Ctrl+L untuk buka Chat
3. Ketik prompt: "Buat fitur X"
4. Cursor generate code + tests
5. Review changes di Source Control
6. Commit & push
7. CI/CD otomatis verify
```

### GitHub Copilot

#### Setup

1. Install extension "GitHub Copilot" di VS Code
2. Login dengan GitHub account
3. Copilot akan auto-suggest saat coding

#### Contoh Prompt (Copilot Chat)

```
/explain Jelaskan fungsi run_pipeline_background

/tests Generate tests untuk artifact_parser_service

/fix Fix security vulnerability di upload endpoint

@workspace Bagaimana cara kerja forensics pipeline?
```

### ChatGPT / GPT-4

#### Workflow

1. Buka https://chat.openai.com
2. Paste relevant code context
3. Minta generate/refactor/fix
4. Copy hasil ke IDE
5. Run tests locally
6. Push → CI verify

#### Contoh Prompt

```
Saya punya DFIR Collection Kit dengan struktur:
- Backend: FastAPI + SQLAlchemy async
- Agent: Go dengan goroutine pool
- Frontend: React + TypeScript

Tolong buat endpoint POST /api/v1/evidence/{id}/export 
yang support format STIX 2.1 untuk threat intel sharing.

Requirements:
- Async endpoint
- Support streaming untuk large files
- HMAC signature untuk integrity
- Audit log entry
```

---

## 🔧 Workflow Detail

### CI Pipeline Jobs

#### 1. Backend Lint & Security

| Tool | Purpose | Threshold |
|------|---------|-----------|
| Black | Code formatting | 0 diffs |
| isort | Import ordering | 0 diffs |
| Flake8 | Style guide | 0 errors |
| Bandit | Security scan | No HIGH+ |
| Safety | Dependency vulns | Report only |

#### 2. Backend Tests

| Check | Description |
|-------|-------------|
| pytest | Run all tests in `tests/` |
| pytest-cov | Coverage ≥ 70% |
| alembic | Migration chain integrity |
| PostgreSQL 16 | Test database |
| Redis 7 | Celery broker test |

#### 3. Go Agent Lint & Test

| Tool | Purpose |
|------|---------|
| go vet | Static analysis |
| staticcheck | Advanced linting |
| go test -race | Race condition detection |
| coverage | Code coverage report |

#### 4. Frontend Lint & Build

| Tool | Purpose |
|------|---------|
| ESLint | Code quality |
| tsc | Type checking |
| vite build | Production bundle |

#### 5. Docker Build Test

| Check | Description |
|-------|-------------|
| Backend image | Build from Dockerfile |
| Frontend image | Build from Dockerfile |
| docker compose config | Validate compose file |

#### 6. Integration Smoke Test

| Check | Description |
|-------|-------------|
| Service startup | All containers healthy |
| Backend health | `/api/v1/status/health` returns 200 |
| Frontend accessible | HTTPS endpoint reachable |
| Login flow | Auth endpoint works |

### CD Pipeline Jobs

#### 1. Build & Push Images

- Registry: `ghcr.io/angganovryanputra/dfir-collection-kit`
- Tags: `sha-<commit>`, `v*.*.*`, `latest`
- Cache: GitHub Actions cache

#### 2. Security Scan

- Trivy filesystem scan
- Trivy container image scan
- SARIF upload to GitHub Security tab

#### 3. Deploy Staging

- Auto-deploy on merge to main
- Environment: `staging`
- URL: `https://staging.dfir.example.com`

#### 4. Deploy Production

- Manual approval required
- Triggered by version tags (`v*.*.*`)
- Environment: `production`

---

## 🐛 Troubleshooting

### CI Fail: Backend Lint

```bash
# Fix Black formatting
cd backend && black .

# Fix isort
cd backend && isort .

# Fix Flake8
cd backend && flake8 app tests --max-line-length=100
```

### CI Fail: Backend Tests

```bash
# Run tests locally
cd backend
export DFIR_TEST_DATABASE_URL=postgresql+asyncpg://dfir:dfir@localhost:5432/dfir_test
pytest -v --tb=short

# Check coverage
pytest --cov=app --cov-report=term-missing
```

### CI Fail: Go Agent

```bash
# Fix go vet issues
cd agent && go vet ./...

# Fix staticcheck issues
cd agent && staticcheck ./...

# Run tests
cd agent && go test -v ./...
```

### CI Fail: Frontend

```bash
# Fix ESLint
cd frontend && npm run lint -- --fix

# Type check
cd frontend && npx tsc --noEmit

# Build
cd frontend && npm run build
```

### CI Fail: Docker Build

```bash
# Test build locally
docker build -t dfir-backend:test ./backend
docker build -t dfir-frontend:test ./frontend

# Test compose
docker compose config --quiet
```

---

## 📊 Monitoring

### GitHub Actions Dashboard

1. Buka tab **Actions** di repository
2. Pilih workflow run untuk detail
3. Klik job untuk lihat logs

### Status Badge

Tambahkan ke README.md:

```markdown
![CI](https://github.com/angganovryanputra/dfir-collection-kit/workflows/CI%20Pipeline/badge.svg)
![CD](https://github.com/angganovryanputra/dfir-collection-kit/workflows/CD%20Pipeline/badge.svg)
```

---

## 🔐 Security Best Practices

1. **Never commit secrets** — Gunakan GitHub Secrets
2. **Review AI-generated code** — Selalu review sebelum merge
3. **Run security scans** — Bandit, Safety, Trivy otomatis jalan di CI
4. **Branch protection** — Wajibkan PR + status checks
5. **Least privilege** — Token dengan permission minimal

---

## 📚 Resources

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Black Documentation](https://black.readthedocs.io/)
- [pytest Documentation](https://docs.pytest.org/)
- [Trivy Documentation](https://aquasecurity.github.io/trivy/)
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code)
- [Cursor IDE](https://cursor.sh/docs)
