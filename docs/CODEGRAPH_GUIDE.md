# CodeGraph CLI — Windows Setup & Vibe Coding Guide

> **CodeGraph** adalah code graph analysis tool yang memungkinkan AI LLM (Codex, Claude, Cursor, dll) untuk memahami struktur codebase dengan semantic intelligence.

---

## ✅ Status: Terinstall & Berhasil Dikonfigurasi

```
Version: 1.6.0
Location: C:\Users\angga\AppData\Local\codegraph\current\bin\codegraph.cmd
Project Index: D:\DFIRCollectionKit\.codegraph\
Stats: 310 files, 4,687 nodes, 10,009 edges
```

---

## 🚀 Quick Start

### 1. Buka Terminal Baru (PowerShell / Git Bash / CMD)

```bash
# Verify installation
codegraph --version
# Output: 1.6.0
```

### 2. Navigate ke Project

```bash
cd D:\DFIRCollectionKit
```

### 3. Gunakan CodeGraph Commands

```bash
# Explore codebase dengan natural language
codegraph explore "How does the evidence pipeline work?"

# Find callers of a function
codegraph callers run_pipeline_background

# Find callees of a function
codegraph callees dispatch_pipeline

# Analyze impact of changing a symbol
codegraph impact run_pipeline_background

# Search for symbols
codegraph search "evidence"

# Show file structure
codegraph files backend/app/services/

# Show project status
codegraph status
```

---

## 🔧 Konfigurasi untuk Vibe Coding

### PowerShell Profile

```powershell
# Add to $PROFILE
$env:Path = "$env:LOCALAPPDATA\codegraph\current\bin;" + $env:Path
```

### Git Bash / MSYS2

```bash
# Add to ~/.bashrc
export PATH="/c/Users/angga/AppData/Local/codegraph/current/bin:$PATH"
alias codegraph='cmd /c "C:\\Users\\angga\\AppData\\Local\\codegraph\\current\\bin\\codegraph.cmd"'
```

### VS Code Settings

```json
{
  "terminal.integrated.env.windows": {
    "PATH": "${env:LOCALAPPDATA}\\codegraph\\current\\bin;${env:PATH}"
  }
}
```

---

## 🤖 Integrasi dengan AI Agents

### Codex CLI

```bash
# Start codex with codegraph MCP
codex

# Dalam codex:
> "Explore the evidence pipeline"
> "Show me callers of run_pipeline_background"
> "What's the impact of changing EvidenceItem model?"
```

### Claude Code

```bash
# Claude Code auto-detects .mcp.json
claude

# Dalam claude:
> "Use codegraph to explore the pipeline service"
> "Show me the blast radius of changing this function"
```

### Cursor IDE

```bash
# Cursor auto-detects .mcp.json
# Buka folder project di Cursor
# Ctrl+L atau Cmd+L untuk chat

# Dalam Cursor:
> "@codegraph How does authentication work?"
> "@codegraph Show me all admin-only endpoints"
```

---

## 📊 CodeGraph Commands Reference

| Command | Description | Example |
|---------|-------------|---------|
| `explore` | Natural language exploration | `codegraph explore "How does X work?"` |
| `callers` | Find what calls a function | `codegraph callers functionName` |
| `callees` | Find what a function calls | `codegraph callees functionName` |
| `impact` | Analyze blast radius | `codegraph impact functionName` |
| `search` | Search for symbols | `codegraph search "evidence"` |
| `files` | Show file structure | `codegraph files backend/` |
| `node` | Show symbol source | `codegraph node functionName` |
| `status` | Show project index status | `codegraph status` |
| `init` | Initialize project index | `codegraph init` |
| `uninit` | Remove project index | `codegraph uninit` |
| `upgrade` | Update CodeGraph CLI | `codegraph upgrade` |
| `serve` | Start as MCP server | `codegraph serve --mcp` |

---

## 🔄 Auto-Sync

CodeGraph secara otomatis:
- Watch file changes di project
- Update graph saat ada file ditambah/diubah/dihapus
- Tidak perlu re-run `codegraph init` setelah initial setup

---

## 📁 File Structure

```
D:\DFIRCollectionKit\
├── .codegraph/
│   ├── codegraph.db      # SQLite database (13.92 MB)
│   ├── config.json       # Index configuration
│   └── .gitignore        # Ignore patterns
├── .mcp.json             # MCP server configuration
└── ...
```

---

## 🎯 Best Practices untuk Vibe Coding

### 1. Selalu Explore Dulu Sebelum Code

```bash
# Jangan langsung "buat fitur X"
# Explore dulu:
codegraph explore "How does the collection workflow work?"
codegraph callers executeModule
codegraph impact JobModel

# Baru minta AI generate code setelah paham struktur
```

### 2. Gunakan Impact Analysis Sebelum Refactor

```bash
# Sebelum refactor function penting:
codegraph impact run_pipeline_background

# Lihat blast radius, lalu putuskan aman untuk refactor atau tidak
```

### 3. Find Callers untuk Understand Dependencies

```bash
# Ingin tahu siapa yang pakai function ini?
codegraph callers dispatch_pipeline

# Output:
# - backend/app/services/artifact_parser_service.py:428
# - backend/app/worker.py:58
```

### 4. Search untuk Find Related Code

```bash
# Cari semua yang berhubungan dengan "evidence"
codegraph search "evidence"

# Cari semua yang berhubungan dengan "sigma"
codegraph search "sigma"
```

---

## 🔧 Troubleshooting

### codegraph: command not found

```bash
# PowerShell
$env:Path = [Environment]::GetEnvironmentVariable("Path", "User") + ";" + [Environment]::GetEnvironmentVariable("Path", "Machine")

# Git Bash
export PATH="/c/Users/angga/AppData/Local/codegraph/current/bin:$PATH"
```

### Index tidak update

```bash
# Rebuild index
codegraph init

# Atau restart file watcher
codegraph uninit && codegraph init
```

### MCP server tidak connect

```bash
# Test MCP server
codegraph serve --mcp

# Check .mcp.json syntax
cat .mcp.json | python -m json.tool
```

---

## 📚 Resources

- **GitHub**: https://github.com/colbymchenry/codegraph
- **Documentation**: https://colbymchenry.github.io/codegraph/
- **npm**: https://www.npmjs.com/package/@colbymchenry/codegraph

---

> **Last Updated**: 2026-09-02
> **CodeGraph Version**: 1.6.0
