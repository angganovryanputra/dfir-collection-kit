<div align="center">

# 🛡️ DFIR Rapid Collection Kit

**Enterprise Digital Forensics, Triage Acquisition & Automated Incident Response Platform**

[![CI Pipeline](https://github.com/angganovryanputra/dfir-collection-kit/actions/workflows/ci.yml/badge.svg)](https://github.com/angganovryanputra/dfir-collection-kit/actions)
[![CD Pipeline](https://github.com/angganovryanputra/dfir-collection-kit/actions/workflows/cd.yml/badge.svg)](https://github.com/angganovryanputra/dfir-collection-kit/actions)
[![CodeQL Security](https://github.com/angganovryanputra/dfir-collection-kit/actions/workflows/codeql.yml/badge.svg)](https://github.com/angganovryanputra/dfir-collection-kit/actions)
[![Go Version](https://img.shields.io/badge/Go-1.25-00ADD8?logo=go&logoColor=white)](https://golang.org)
[![Python Version](https://img.shields.io/badge/Python-3.12-3776AB?logo=python&logoColor=white)](https://python.org)
[![React Version](https://img.shields.io/badge/React-18.3-61DAFB?logo=react&logoColor=black)](https://react.dev)
[![DuckDB](https://img.shields.io/badge/DuckDB-Vectorized_Analytics-FFF000?logo=duckdb&logoColor=black)](https://duckdb.org)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white)](https://www.docker.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

<p align="center">
  <a href="#-key-features">Key Features</a> •
  <a href="#-quick-start-2-minutes">Quick Start</a> •
  <a href="#-comparison-matrix">Comparison Matrix</a> •
  <a href="#-system-architecture">Architecture</a> •
  <a href="#-collection-modules">Modules</a> •
  <a href="#-forensic-integrity--compliance">Compliance</a> •
  <a href="#-auto-update--cicd">Auto-Update</a> •
  <a href="#-api-documentation">API Docs</a>
</p>

</div>

---

## 📌 Overview

**DFIR Rapid Collection Kit** is a modern, unified evidence acquisition, forensic parsing, and threat hunting platform engineered for Digital Forensics and Incident Response (DFIR) practitioners, SOC analysts, and incident handlers.

It bridges the gap between raw endpoint artifact acquisition and actionable tactical intelligence by orchestrating an end-to-end workflow:
1. **Triage & Acquisition**: Ultra-fast, cross-platform endpoint collection via lightweight Go agents enforcing RFC 3227 Order of Volatility.
2. **Local Pre-Parsing**: On-device parsing of high-volume artifacts (EVTX, LNK, Prefetch, SQLite) prior to streaming upload.
3. **Automated Pipeline**: Background Celery workers running Eric Zimmerman's EZTools, Hayabusa, and Chainsaw Sigma detectors.
4. **Vectorized Super-Timeline**: High-performance DuckDB columnar indexing providing sub-second full-text searches across millions of events.
5. **Forensic Integrity**: ISO/IEC 27037 and NIST SP 800-86 compliance with SHA-256 hash chaining, locked vaults, and immutable audit trails.

---

## ⚡ Key Features

<table>
  <tr>
    <td width="50%">
      <h3>🚀 Ultra-Fast Go Endpoint Agent</h3>
      <ul>
        <li><b>131+ Curated Modules</b> across Windows, Linux, and macOS.</li>
        <li><b>Zero-Dependency Binary</b>: Single self-contained executable with OPSEC jitter and minimal CPU/memory footprint.</li>
        <li><b>Local On-Device Parsing</b>: Parses EVTX &rarr; JSONL, Prefetch &rarr; CSV, and SQLite databases before network egress.</li>
        <li><b>VSS Snapshot Serialization</b>: Mutex-locked Volume Shadow Copy creation preventing provider collisions during live acquisition.</li>
        <li><b>Point-of-Capture SHA-256 Manifest</b>: Computes cryptographic hashes directly on target endpoints prior to compression.</li>
      </ul>
    </td>
    <td width="50%">
      <h3>🔍 Vectorized DuckDB Super-Timeline</h3>
      <ul>
        <li><b>Columnar Query Engine</b>: In-memory & persistent DuckDB store capable of indexing millions of forensic records instantly.</li>
        <li><b>Cross-Host Correlation</b>: Unifies event logs, registry hives, filesystem timelines, and network artifacts into one timeline.</li>
        <li><b>Connection Pooling</b>: Thread-safe read-only connection pooling eliminates file lock contention under concurrent analysts.</li>
        <li><b>Export Readiness</b>: One-click export to CSV, JSONL, or Timesketch-compatible datasets.</li>
      </ul>
    </td>
  </tr>
  <tr>
    <td width="50%">
      <h3>🎯 Automated Sigma & YARA Hunting</h3>
      <ul>
        <li><b>Dual Sigma Engines</b>: Executes <b>Hayabusa</b> and <b>Chainsaw</b> against harvested EVTX records in isolated workers.</li>
        <li><b>Kill Chain Visualization</b>: Maps detections dynamically to MITRE ATT&CK tactics, techniques, and attack chains.</li>
        <li><b>YARA Scanner</b>: Inspects collected file payloads and memory dumps against custom signature sets.</li>
        <li><b>24-Hour Threat Intel Cache</b>: Integrated VirusTotal v3 and MISP lookups with Redis caching to preserve API quotas.</li>
      </ul>
    </td>
    <td width="50%">
      <h3>🔒 Cryptographic Chain of Custody</h3>
      <ul>
        <li><b>Tamper-Evident Storage</b>: SHA-256 hash manifests and immutable <code>LOCKED</code> evidentiary vault markers.</li>
        <li><b>Genesis Checkpoints</b>: Archival checkpoints preserve continuous mathematical hash-chaining across log retention pruning.</li>
        <li><b>Constant-Time Verification</b>: Timing-safe <code>hmac.compare_digest</code> export verification for court admissibility.</li>
        <li><b>Role-Based Access Control</b>: Granular RBAC (<code>admin</code> &gt; <code>operator</code> &gt; <code>viewer</code>) with UI role route guarding.</li>
      </ul>
    </td>
  </tr>
  <tr>
    <td width="50%">
      <h3>💻 Live Interactive Web Console</h3>
      <ul>
        <li><b>Sub-5s Remote Terminal</b>: Execute live triage commands directly from the browser HUD without exposing SSH or RDP.</li>
        <li><b>Redis Pub/Sub Bus</b>: Horizontally scalable command distribution across multiple backend Uvicorn workers.</li>
        <li><b>Full Audit Trail</b>: Every keystroke, shell invocation, and exit code is recorded in the cryptographically chained audit log.</li>
      </ul>
    </td>
    <td width="50%">
      <h3>📊 Incident Command Center & Templates</h3>
      <ul>
        <li><b>Case Management Hub</b>: Incident lifecycle tracker (PENDING &rarr; ACTIVE &rarr; IN_PROGRESS &rarr; COMPLETED &rarr; CLOSED).</li>
        <li><b>Curated Profiles</b>: One-click collection templates (<code>triage</code>, <code>ransomware</code>, <code>insider_threat</code>, <code>full</code>).</li>
        <li><b>Legal Holds & Notes</b>: Integrated case evidence tagging, analyst notes, and executive PDF/HTML report exports.</li>
      </ul>
    </td>
  </tr>
</table>

---

## 📊 Comparison Matrix

| Feature / Capability | DFIR Rapid Collection Kit | Velociraptor | CyLR | KAPE | UAC (Unix) |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Cross-Platform Agent** | ✅ Windows, Linux, macOS | ✅ Windows, Linux, macOS | ⚠️ Windows / Linux | ❌ Windows Only | ❌ Unix Only |
| **Local Artifact Parsing** | ✅ EVTX, LNK, Prefetch, SQLite | ⚠️ VQL Scripts | ❌ Raw Copy Only | ✅ via EZTools | ❌ Raw Copy Only |
| **Vectorized DuckDB Timeline**| ✅ Built-in & Columnar | ❌ SQLite / Flat | ❌ None | ❌ None | ❌ None |
| **Automated Sigma Hunting** | ✅ Hayabusa + Chainsaw | ⚠️ Custom VQL | ❌ None | ⚠️ via EZTools | ❌ None |
| **Point-of-Capture SHA-256** | ✅ Standard Manifest | ⚠️ Server-side | ❌ Post-upload | ⚠️ Module output | ❌ Post-upload |
| **Web Console (No RDP/SSH)** | ✅ Real-time WebSocket | ✅ Shell VQL | ❌ None | ❌ None | ❌ None |
| **Tamper-Evident Vault** | ✅ RFC 3227 & LOCKED state | ⚠️ Database rows | ❌ None | ❌ None | ❌ None |
| **Zero-Build Self-Hosted** | ✅ Prebuilt GHCR Containers | ⚠️ Custom Setup | ❌ CLI Only | ❌ CLI Only | ❌ CLI Only |

---

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            Analyst Web HUD (SPA)                            │
│                  React 18 · TypeScript · Vite · Tailwind CSS                │
│                                Port 443 (HTTPS)                             │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ REST API & WebSockets (JWT Bearer)
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            Hardened Nginx Proxy                             │
│                  TLS 1.3 Termination · Strict Security Headers              │
└──────────────────────┬───────────────────────────────┬──────────────────────┘
                       │ /api/v1/*                     │ /* (SPA)
                       ▼                               ▼
┌──────────────────────────────────────────────┐ ┌────────────────────────────┐
│           FastAPI Backend (:8000)            │ │       Static Frontend      │
│  Async SQLAlchemy 2.0 · RBAC · Rate Limiter  │ │          (:8080)           │
│  DuckDB Pool · Threat Intel Redis Cache      │ └────────────────────────────┘
└──────┬──────────────┬───────────────┬────────┘
       │              │               │
       ▼              ▼               ▼
┌─────────────┐ ┌───────────┐ ┌───────────────────────────────────────────────┐
│ PostgreSQL  │ │   Redis   │ │           Evidence Storage Vault            │
│    :5432    │ │   :6379   │ │              /vault/evidence/               │
│ (Audit/Data)│ │ (Bus/Queue│ │  /{incident_id}/{job_id}/collection.zip       │
└─────────────┘ └─────┬─────┘ │  /extracted /hashes.sha256 /LOCKED            │
                      │       └───────────────────────▲───────────────────────┘
                      ▼                               │
┌──────────────────────────────────────────────┐      │
│            Celery Worker Clusters            │──────┘
│  - Queue: forensics (EZTools, Chainsaw, etc) │
│  - Queue: periodic (Beat crons, Legal Holds) │
└──────────────────────────────────────────────┘
                       ▲
                       │ Streaming Multipart (Content-Length, X-Agent-Token)
                       │ Polling & WebSocket Live Console
┌──────────────────────┴──────────────────────────────────────────────────────┐
│                        Distributed Go Agents (v1.25)                        │
│   Windows (VSS Mutex)  ·  Linux (Proc Memory Safe)  ·  macOS (Multi-User)   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Quick Start (2 Minutes)

### Option A: Prebuilt Stack (Recommended for Self-Hosted)
No compiler, Node.js, Python, or local build toolchains required. Pulls pre-tested production images directly from GitHub Container Registry.

```bash
# 1. Clone repository
git clone https://github.com/angganovryanputra/dfir-collection-kit.git
cd dfir-collection-kit

# 2. Generate secure credentials & self-signed TLS certificates
make setup

# 3. Launch prebuilt production containers
make prod-up
```

Access the application at **`https://localhost`** (or your server's IP address).

Default administrator credentials will be output to your terminal and saved in `.env` (`DFIR_DEFAULT_ADMIN_PASSWORD`).

---

### Option B: Local Development Stack (From Source)

```bash
# Start backend reload + Vite HMR development stack
make dev-up

# Run full backend test suite
make test-backend

# Build cross-platform agent binaries
make agent-all
```

---

## 🔄 Auto-Update & CI/CD

Keep your self-hosted instance continuously updated with the latest forensic capabilities without rebuilding Docker containers.

### Method 1: Instant One-Command Update
When a new version or commit is released:
```bash
make update
```
*Pulls newest GHCR images, updates running containers seamlessly, and executes pending Alembic database migrations.*

### Method 2: Zero-Touch Background Auto-Update (Watchtower)
To run a self-updating forensic appliance:
```bash
make auto-update
```
*Launches Watchtower daemon to monitor GitHub Container Registry every 5 minutes and hot-reload running services automatically with zero downtime.*

For complete configuration and rollback instructions, see [docs/CI_CD_AUTO_UPDATE.md](docs/CI_CD_AUTO_UPDATE.md).

---

## 📦 Collection Modules

The kit includes **131+ production modules** organized into 5 standardized categories:

```
agent/internal/modules/
├── volatile/       # RAM, processes, open ports, network connections, logged-on users
├── logs/           # Windows EVTX, Linux Journald/Syslog/Audit, macOS Unified Logs
├── persistence/    # Scheduled tasks, cron, systemd units, Registry Run keys, WMI subs
├── artifacts/      # Registry hives, $MFT, $UsnJrnl, Prefetch, LNK, Browser history, SRUM
└── system/         # Installed patches, user accounts, bash/zsh history, USB history
```

### Curated Collection Profiles
| Profile | Target Scenario | Modules Included | Typical Duration |
| :--- | :--- | :--- | :---: |
| `triage` | Fast incident scoping | Volatile state + security logs + network sockets | < 60 seconds |
| `ransomware` | Active malware outbreak | Event logs + persistence + volume shadow copies + MFT | 2 - 4 minutes |
| `insider_threat`| Data exfiltration & espionage | Browser databases + USB history + LNK/JumpLists + ShellBags | 3 - 5 minutes |
| `full` | Comprehensive deep acquisition | Complete 130+ module suite including memory & transaction logs | Deep collection |

---

## 🛡️ Forensic Integrity & Compliance

The platform adheres to international evidentiary standards for digital forensics:

* **ISO/IEC 27037:2012**: *Guidelines for identification, collection, acquisition and preservation of digital evidence.*
  - On-endpoint point-of-capture cryptographic SHA-256 manifests (`manifest.sha256`).
  - Immutable evidentiary locking via server-side file system `LOCKED` markers.
* **NIST SP 800-86**: *Guide to Integrating Forensic Techniques into Incident Response.*
  - Unbroken chain-of-custody tracking with cryptographic previous-hash anchoring.
  - Archival Genesis Checkpoints preserving chain verification during log retention roll-offs.
* **RFC 3227**: *Guidelines for Evidence Collection and Archiving (Order of Volatility).*
  - Volatile registers and physical memory acquired sequentially before touching persistent disks.

---

## 💻 Agent Deployment

Cross-compiled Go agent binaries are completely self-contained and require no runtime dependencies or installations.

### Compile Binaries
```bash
make agent-windows      # agent/dist/dfir-agent.exe (Windows x64)
make agent-linux        # agent/dist/dfir-agent-linux (Linux x64)
make agent-linux-arm64  # agent/dist/dfir-agent-linux-arm64 (Linux ARM64)
make agent-darwin-arm64 # agent/dist/dfir-agent-darwin-arm64 (macOS Apple Silicon)
```

### Execution Example
```bash
# Linux / macOS
export DFIR_BACKEND_URL="https://dfir-server.corp:443/api/v1"
export DFIR_AGENT_SECRET="your-cluster-shared-secret"
sudo ./dfir-agent

# Windows PowerShell (Run as Administrator)
$env:DFIR_BACKEND_URL="https://dfir-server.corp:443/api/v1"
$env:DFIR_AGENT_SECRET="your-cluster-shared-secret"
.\dfir-agent.exe
```

---

## 📚 API Documentation

The platform provides a comprehensive OpenAPI v3 REST API. Explore the interactive Swagger & ReDoc documentation:

- **Swagger UI**: `https://localhost/api/v1/docs`
- **ReDoc UI**: `https://localhost/api/v1/redoc`

| Resource Group | Endpoint Prefix | Primary Operations |
| :--- | :--- | :--- |
| **Authentication** | `/api/v1/auth/` | Session login, logout, password resets |
| **Incidents** | `/api/v1/incidents/` | Incident lifecycle CRUD, scoping, report export |
| **Collection** | `/api/v1/agents/` | Agent registration, job long-polling, multipart upload |
| **Live Console** | `/api/v1/agent-commands/` | Interactive shell commands, WebSocket streaming |
| **Evidence Vault** | `/api/v1/evidence/` | Download artifacts, verified ZIP exports, DuckDB queries |
| **Threat Analytics** | `/api/v1/processing/` | Sigma hits, YARA matches, attack chain graphs |
| **Chain of Custody** | `/api/v1/chain-of-custody/` | Cryptographically verified ledger and CSV export |

For complete schemas and code samples, refer to [docs/API_REFERENCE.md](docs/API_REFERENCE.md).

---

## 🤝 Contributing

Contributions, feature requests, and bug reports are welcome!
1. Fork the Project.
2. Create your Feature Branch (`git checkout -b feat/amazing-feature`).
3. Commit your Changes (`git commit -m 'feat: add amazing feature'`).
4. Push to the Branch (`git push origin feat/amazing-feature`).
5. Open a Pull Request.

---

## 📄 License

Distributed under the **MIT License**. See [`LICENSE`](LICENSE) for more information.

<div align="center">
  <sub>Built with ❤️ by DFIR practitioners for incident responders worldwide.</sub>
</div>
