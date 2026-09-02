# Codex CLI — Panduan Setup & Vibe Coding

> **Codex CLI** adalah command-line interface untuk OpenAI Codex. Panduan ini cara setup MCP server yang optimal untuk DFIR Collection Kit.

---

## 📋 Daftar Isi

1. [Apa itu Codex CLI?](#apa-itu-codex-cli)
2. [Install Codex CLI](#install-codex-cli)
3. [MCP Server Setup](#mcp-server-setup)
4. [Vibe Coding Workflow](#vibe-coding-workflow)
5. [Token Optimization](#token-optimization)
6. [Best Practices](#best-practices)

---

## Apa itu Codex CLI?

Codex CLI adalah AI-powered command-line tool dari OpenAI yang bisa:
- Generate code dari natural language
- Debug dan fix bugs
- Refactor code
- Generate tests
- Navigate large codebases

**Kenapa pakai MCP Server?**
- ✅ **Hemat token** — tidak perlu baca seluruh file
- ✅ **Struktur jelas** — tahu relasi antar module
- ✅ **Context-aware** — suggest sesuai project convention
- ✅ **Fast iteration** — explore → understand → code dalam 1 session

---

## Install Codex CLI

### Prerequisites
- Node.js 18+
- Python 3.12+
- Go 1.23+

### Installation

```bash
# Install Codex CLI globally
npm install -g @openai/codex

# Verify installation
codex --version

# Login (OpenAI account required)
codex login
```

### Alternative: Install via Cargo
```bash
cargo install codex-cli
```

---

## MCP Server Setup

### Apa itu MCP?

**Model Context Protocol (MCP)** adalah standar untuk connect AI model ke external tools & data sources. Dengan MCP:
- AI bisa query database langsung
- AI bisa search code dengan knowledge graph
- AI bisa akses filesystem dengan structured way
- AI bisa fetch documentation online

### MCP Server yang Direkomendasikan

#### 1. **code-review-graph** (WAJIB)
Knowledge graph untuk codebase navigation. Explore struktur tanpa baca file satu per satu.

```bash
# Install
npm install -g code-review-graph

# Atau run langsung
npx code-review-graph serve
```

**Capabilities**:
- `semantic_search_nodes` — cari function/class by keyword
- `query_graph` — trace callers, callees, imports
- `get_impact_radius` — lihat blast radius sebuah change
- `detect_changes` — review code changes dengan risk score
- `get_review_context` — token-efficient code review

#### 2. **filesystem** (WAJIB)
Akses file project dengan structured way.

```bash
npx @modelcontextprotocol/server-filesystem .
```

#### 3. **github** (RECOMMENDED)
Interact dengan GitHub — create issues, PRs, review code.

```bash
export GITHUB_TOKEN=ghp_your_token_here
npx @modelcontextprotocol/server-github
```

#### 4. **postgres** (RECOMMENDED)
Query database langsung dari AI.

```bash
export DATABASE_URL=postgresql+asyncpg://dfir:dfir@localhost:5432/dfir
npx @modelcontextprotocol/server-postgres
```

#### 5. **memory** (RECOMMENDED)
Persistent memory antar session.

```bash
npx @modelcontextprotocol/server-memory
```

#### 6. **fetch** (OPTIONAL)
Fetch documentation dan web pages.

```bash
npx @modelcontextprotocol/server-fetch
```

#### 7. **sequential-thinking** (OPTIONAL)
Untuk complex reasoning tasks.

```bash
npx @modelcontextprotocol/server-sequential-thinking
```

### Konfigurasi MCP

File `.mcp.json` sudah dibuat di root project. Isi:

```json
{
  "mcpServers": {
    "code-review-graph": {
      "command": "code-review-graph",
      "args": ["serve"],
      "type": "stdio"
    },
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "."],
      "type": "stdio"
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "type": "stdio",
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_TOKEN}"
      }
    },
    "postgres": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres"],
      "type": "stdio",
      "env": {
        "POSTGRES_CONNECTION_URL": "${DATABASE_URL}"
      }
    },
    "memory": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-memory"],
      "type": "stdio"
    },
    "fetch": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-fetch"],
      "type": "stdio"
    }
  }
}
```

### Environment Variables

Buat file `.env.mcp`:

```bash
# GitHub
GITHUB_TOKEN=ghp_your_personal_access_token

# Database
DATABASE_URL=postgresql+asyncpg://dfir:dfir@localhost:5432/dfir

# OpenAI (untuk Codex)
OPENAI_API_KEY=sk-your-openai-api-key
```

---

## Vibe Coding Workflow

### 1. Start Session

```bash
# Buka terminal di project root
cd D:\DFIRCollectionKit

# Start Codex dengan MCP
codex

# Atau dengan model specific
codex --model gpt-4o
codex --model o1-preview
```

### 2. Explore Codebase (Hemat Token!)

```
# Jangan baca file satu per satu!
# Gunakan MCP untuk explore:

> "Show me the call graph for run_pipeline_background"
> "What are the dependencies of artifact_parser_service?"
> "Find all endpoints that require admin role"
> "Show me the database schema for evidence module"
```

### 3. Generate Code

```
> "Add new endpoint POST /api/v1/evidence/{id}/export that exports to STIX 2.1"
> "Create a new collection module for Windows Defender logs"
> "Add tests for the sigma_hunter service"
> "Refactor the pipeline to support plugin architecture"
```

### 4. Review & Fix

```
> "Review the changes in PR #42"
> "Find security vulnerabilities in upload endpoints"
> "Fix the race condition in agent executor"
> "Add error handling for corrupt EVTX files"
```

### 5. Generate Tests

```
> "Generate integration test for full collection workflow"
> "Add unit tests for timeline_builder service"
> "Create E2E test for login → create incident → collect evidence"
```

---

## Token Optimization

### ❌ Cara Lama (Boros Token)
```
> "Read backend/app/services/artifact_parser_service.py"
> "Read backend/app/core/modules.py"
> "Read backend/app/models/processing.py"
> "Now add a new pipeline phase"
```
**Token used**: ~15.000 (hanya untuk baca files)

### ✅ Cara MCP (Hemat Token)
```
> "Show me the pipeline phases and their dependencies"
> "Add new phase for STIX export after timeline merge"
```
**Token used**: ~3.000 (80% savings!)

### Tips Hemat Token

1. **Gunakan knowledge graph**
   ```
   > "What calls run_pipeline_background?"
   > "Show impact radius of changing EvidenceItem model"
   ```

2. **Query database langsung**
   ```
   > "Show me all columns in processing_jobs table"
   > "What's the average pipeline duration?"
   ```

3. **Search by semantic**
   ```
   > "Find code that handles evidence upload"
   > "Where is JWT token validated?"
   ```

4. **Gunakan CODEX.md**
   ```
   > "Read CODEX.md for project context"
   > "Based on CODEX.md patterns, add new module"
   ```

---

## Best Practices

### 1. Selalu Baca CODEX.md Dulu
```
> "Read CODEX.md and summarize the key patterns"
```
Ini hemat ~10.000 token dibanding baca semua file!

### 2. Gunakan Semantic Search
```
> "Find all places where evidence hash is computed"
> "Show me the RBAC enforcement pattern"
```

### 3. Batch Operations
```
> "Add tests for all endpoint files in api/v1/endpoints/"
> "Add input validation to all POST endpoints"
```

### 4. Review Before Commit
```
> "Review all changes in this session"
> "Check for security issues in the new code"
> "Verify test coverage for new functions"
```

### 5. Generate Documentation
```
> "Generate API documentation for evidence endpoints"
> "Create sequence diagram for collection workflow"
> "Write migration guide for new version"
```

---

## 🔧 Troubleshooting

### MCP Server Tidak Connect
```bash
# Test MCP server manually
npx code-review-graph serve
npx @modelcontextprotocol/server-filesystem .

# Check .mcp.json syntax
cat .mcp.json | python -m json.tool
```

### Codex Tidak Baca MCP Config
```bash
# Pastikan .mcp.json ada di working directory
ls -la .mcp.json

# Run codex dengan explicit config
codex --config .mcp.json
```

### Token Limit Terlampaui
```
# Gunakan model dengan larger context
codex --model gpt-4o

# Atau break task menjadi smaller chunks
> "First, explore the evidence module structure"
> "Now, add the export endpoint"
> "Finally, add tests"
```

---

## 📊 Perbandingan AI Tools

| Tool | MCP Support | Best For | Token Efficiency |
|------|-------------|----------|------------------|
| Codex CLI | ✅ Yes | Code generation, refactoring | ⭐⭐⭐⭐ |
| Claude Code | ✅ Yes | Complex reasoning, large codebases | ⭐⭐⭐⭐⭐ |
| Cursor | ✅ Yes | IDE integration, inline editing | ⭐⭐⭐⭐ |
| GitHub Copilot | ❌ No | Inline suggestions | ⭐⭐⭐ |
| ChatGPT | ❌ No | Quick questions, explanations | ⭐⭐ |

---

## 🎯 Quick Reference

```bash
# Start Codex
codex

# Start dengan model specific
codex --model gpt-4o

# Start dengan task
codex "Add STIX export endpoint to evidence module"

# Continue session
codex --continue

# Show help
codex --help
```

---

> **Tip**: Selalu gunakan `CODEX.md` sebagai entry point! File ini didesain untuk memberikan context lengkap dengan minimal token.
