# Implementation Prompt — DFIR Collection Kit Hardening & Enhancement

> **Copy prompt di bawah ini dan paste ke AI Agent kamu (Codex, Claude, Cursor, dll)**

---

## Prompt untuk AI Agent

```
You are a senior DFIR platform engineer. Implement security hardening and feature enhancements for the DFIR Collection Kit at D:\DFIRCollectionKit.

## CURRENT STATE

The project is a production-grade DFIR evidence collection system:
- Backend: FastAPI (Python 3.12) + async SQLAlchemy + PostgreSQL + Redis + Celery
- Frontend: React 18 + TypeScript + Vite + Tailwind + shadcn/ui
- Agent: Go 1.23 (collection agent for Windows/Linux/macOS)
- Infrastructure: Docker Compose + Nginx reverse proxy
- 135 frontend files, 43 Go files, 105 Python files

## PART 1 — SECURITY HARDENING (CRITICAL)

### 1.1 Rotate TLS Key & Purge from Git History

**Problem:** nginx/certs/key.pem is tracked in git history. Private key must be rotated and purged.

**Steps:**
1. Generate new self-signed certificate:
   ```bash
   openssl req -x509 -newkey rsa:4096 -keyout nginx/certs/key.pem -out nginx/certs/cert.pem -days 365 -nodes -subj "/CN=localhost"
   ```
2. Add to .gitignore:
   ```
   # TLS certificates — never commit private keys
   nginx/certs/*.pem
   nginx/certs/*.key
   nginx/certs/*.crt
   ```
3. Purge from git history using git-filter-repo:
   ```bash
   pip install git-filter-repo
   git filter-repo --path nginx/certs/key.pem --invert-paths --force
   ```
4. Add pre-commit hook .git/hooks/pre-commit:
   ```bash
   #!/bin/bash
   if git diff --cached --name-only | xargs grep -l "BEGIN RSA PRIVATE KEY" 2>/dev/null; then
       echo "ERROR: Private key detected in commit!"
       exit 1
   fi
   ```

### 1.2 Fix VITE_API_BASE_URL Default

**Problem:** Default https://localhost/api/v1 causes frontend to call user's localhost instead of server.

**File:** docker-compose.yml line 186

**Change:**
```yaml
# BEFORE:
args:
  VITE_API_BASE_URL: ${VITE_API_BASE_URL:-https://localhost/api/v1}

# AFTER:
args:
  VITE_API_BASE_URL: ${VITE_API_BASE_URL:-/api/v1}
```

**Why:** Relative path = same-origin requests = no CORS, no certificate issues, works behind any reverse proxy.

### 1.3 Fix Nginx WebSocket Upgrade

**Problem:** proxy_set_header Connection ""; removes WebSocket upgrade headers. Agent Console WebSocket fails.

**File:** nginx/nginx-ssl.conf

**Add BEFORE the existing /api/ location block:**
```nginx
# ── WebSocket — Agent Commands ────────────────────────────────────────
location ~ ^/api/v1/agent-commands/ws/ {
    proxy_pass         http://backend:8000;
    proxy_http_version 1.1;
    proxy_set_header   Host              $host;
    proxy_set_header   X-Real-IP         $remote_addr;
    proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header   X-Forwarded-Proto $scheme;
    proxy_set_header   Upgrade           $http_upgrade;
    proxy_set_header   Connection        "upgrade";
    proxy_read_timeout  3600s;
    proxy_send_timeout  3600s;
}
```

### 1.4 Fix Frontend Healthcheck

**Problem:** Healthcheck uses curl but it's not installed in the nginx:alpine image.

**File:** frontend/Dockerfile

**Add after FROM nginx:1.27-alpine:**
```dockerfile
# Install curl for healthcheck
RUN apk add --no-cache curl
```

### 1.5 Add .dockerignore for Subdirectories

**Problem:** Root .dockerignore doesn't apply to ./frontend and ./backend build contexts. node_modules, .env, __pycache__ can be sent to Docker daemon.

**Create frontend/.dockerignore:**
```
node_modules
.env
.env.local
dist
.git
*.log
Dockerfile.dev
test.html
src/App.test.tsx
```

**Create backend/.dockerignore:**
```
.env
.env.local
__pycache__
*.pyc
.git
*.log
.venv
venv
.pytest_cache
.mypy_cache
.ruff_cache
.tox
.nox
*.egg-info
.eggs
```

### 1.6 Fix Volume Ownership with Init Container

**Problem:** Named volumes are mounted after Dockerfile chown. New volumes are root-owned, non-root process can't write.

**File:** docker-compose.yml

**Add new service BEFORE backend:**
```yaml
  # ── Init container: fix volume ownership ────────────────────────────────
  init-volumes:
    image: alpine:3.19
    command: >
      sh -c "
        chown -R 1000:1000 /vault/evidence &&
        chown -R 1000:1000 /var/celery
      "
    volumes:
      - dfir_evidence:/vault/evidence
      - dfir_celerybeat:/var/celery
    restart: "no"
    networks:
      - dfir-network
```

**Update backend and celery_worker depends_on:**
```yaml
  backend:
    depends_on:
      init-volumes:
        condition: service_completed_successfully
      db:
        condition: service_healthy
      redis:
        condition: service_healthy

  celery_worker:
    depends_on:
      init-volumes:
        condition: service_completed_successfully
```

### 1.7 Document DFIR Tools Mount Requirement

**Problem:** EZTools, Hayabusa, Chainsaw are not bundled. Pipeline won't work without manual mount.

**Create docs/FORENSICS_TOOLS.md:**
```markdown
# Forensics Tools Setup

The forensics pipeline requires external tools that are NOT bundled in the Docker image.

## Required Tools

| Tool | Path in Container | Purpose |
|------|-------------------|---------|
| EZTools | /opt/eztools | EVTX, MFT, Registry, Prefetch, LNK parsing |
| Hayabusa | /opt/hayabusa/hayabusa | Sigma-based threat hunting |
| Chainsaw | /opt/chainsaw/chainsaw | Rapid EVTX hunting |

## Installation

1. Download tools to ./forensics/ directory:
   ```bash
   mkdir -p forensics
   # Download EZTools from https://ericzimmerman.github.io/
   # Download Hayabusa from https://github.com/Yamato-Security/hayabusa/
   # Download Chainsaw from https://github.com/WithSecureLabs/chainsaw/
   ```

2. Mount via docker-compose.override.yml:
   ```yaml
   services:
     backend:
       volumes:
         - ./forensics/eztools:/opt/eztools:ro
         - ./forensics/hayabusa:/opt/hayabusa:ro
         - ./forensics/chainsaw:/opt/chainsaw:ro
   ```

3. Configure paths in Admin Settings → Forensics Pipeline.
```

**Add to docker-compose.yml a commented example:**
```yaml
    # Uncomment to mount forensics tools:
    # volumes:
    #   - ./forensics/eztools:/opt/eztools:ro
    #   - ./forensics/hayabusa:/opt/hayabusa:ro
    #   - ./forensics/chainsaw:/opt/chainsaw:ro
```

---

## PART 2 — UNIFIED SCHEMA NORMALIZATION

### 2.1 Create Unified Schema Module

**Create backend/app/services/timeline_schema.py:**
```python
"""Unified timeline schema for all artifact sources."""

from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import uuid4


@dataclass
class UnifiedEvent:
    """Single normalized timeline event."""
    
    # Core fields
    timestamp: str = ""                          # ISO 8601 UTC
    timestamp_desc: str = ""                     # Human readable
    source: str = ""                             # Full source name
    source_short: str = ""                       # Short code (EVTX, MFT, etc)
    computer: str = ""                           # Hostname
    
    # Event classification
    event_id: Optional[int] = None              # Windows Event ID
    event_id_str: str = ""                      # String version
    level: str = "information"                  # Log level
    category: str = ""                          # Event category
    message: str = ""                           # Human readable message
    
    # Entities
    actor: str = ""                              # Who did it
    target: str = ""                             # What was affected
    action: str = ""                             # What happened
    result: str = "unknown"                      # Outcome
    
    # Network
    source_ip: str = ""
    dest_ip: str = ""
    source_port: Optional[int] = None
    dest_port: Optional[int] = None
    protocol: str = ""
    
    # Process
    process: str = ""
    command_line: str = ""
    hashes: dict = field(default_factory=dict)   # md5, sha1, sha256
    
    # Threat intel
    mitre_technique: str = ""                    # T-code
    mitre_tactic: str = ""                       # Tactic name
    severity: str = "low"                        # low, medium, high, critical
    confidence: float = 0.5                      # 0-1
    tags: list = field(default_factory=list)
    
    # Metadata
    raw_data: dict = field(default_factory=dict)
    original_file: str = ""
    incident_id: str = ""
    collection_job_id: str = ""
    event_id_unique: str = ""                    # Dedup key
    
    def to_dict(self) -> dict:
        return asdict(self)
    
    def to_cef(self) -> str:
        """Convert to CEF format for SIEM export."""
        severity_map = {"low": 1, "medium": 5, "high": 7, "critical": 10}
        return (
            f"CEF:0|DFIR|CollectionKit|1.0|{self.event_id or 0}|"
            f"{self.category or self.source_short}|{severity_map.get(self.severity, 1)}|"
            f"rt={self.timestamp} src={self.source_ip} dst={self.dest_ip} "
            f"suser={self.actor} dhost={self.computer} msg={self.message[:500]}"
        )
    
    def to_leef(self) -> str:
        """Convert to LEEF format for QRadar."""
        return (
            f"LEEF:2.0|DFIR|CollectionKit|1.0|{self.event_id or 0}|"
            f"\trt={self.timestamp}\tsrc={self.source_ip}\tdst={self.dest_ip}\t"
            f"suser={self.actor}\thost={self.computer}\tmsg={self.message[:500]}"
        )


# Source name registry
SOURCE_NAMES = {
    "evtx": {"full": "Windows Event Log", "short": "EVTX"},
    "mft": {"full": "NTFS Master File Table", "short": "MFT"},
    "usnjrnl": {"full": "NTFS USN Journal", "short": "USNJRNL"},
    "registry": {"full": "Windows Registry", "short": "REG"},
    "prefetch": {"full": "Windows Prefetch", "short": "PREFETCH"},
    "lnk": {"full": "Windows LNK File", "short": "LNK"},
    "jumplists": {"full": "Windows Jump Lists", "short": "JUMPLIST"},
    "amcache": {"full": "Windows Amcache", "short": "AMCACHE"},
    "shellbags": {"full": "Windows Shellbags", "short": "SHELLBAG"},
    "bits_jobs": {"full": "Windows BITS Jobs", "short": "BITS"},
    "user_assist": {"full": "Windows UserAssist", "short": "USERASSIST"},
    "firewall_rules": {"full": "Windows Firewall Rules", "short": "FWRULE"},
    "firewall_logs": {"full": "Windows Firewall Logs", "short": "FWLOG"},
    "srum": {"full": "Windows SRUM Database", "short": "SRUM"},
    "shimcache": {"full": "Windows ShimCache", "short": "SHIMCACHE"},
    "sysmon": {"full": "Sysmon", "short": "SYSMON"},
    "sigma": {"full": "Sigma Detection", "short": "SIGMA"},
    "yara": {"full": "YARA Match", "short": "YARA"},
    "ioc": {"full": "IOC Match", "short": "IOC"},
}


# MITRE ATT&CK mapping by Event ID
MITRE_EVENT_MAPPING = {
    4624: {"technique": "T1078", "tactic": "Initial Access", "category": "Logon"},
    4625: {"technique": "T1110", "tactic": "Credential Access", "category": "Failed Logon"},
    4648: {"technique": "T1078", "tactic": "Initial Access", "category": "Explicit Credential Logon"},
    4672: {"technique": "T1078", "tactic": "Privilege Escalation", "category": "Special Privileges"},
    4688: {"technique": "T1059", "tactic": "Execution", "category": "Process Creation"},
    4689: {"technique": "T1059", "tactic": "Execution", "category": "Process Termination"},
    4697: {"technique": "T1053", "tactic": "Persistence", "category": "Service Installed"},
    4698: {"technique": "T1053.005", "tactic": "Persistence", "category": "Scheduled Task Created"},
    4699: {"technique": "T1053.005", "tactic": "Persistence", "category": "Scheduled Task Deleted"},
    4720: {"technique": "T1136", "tactic": "Persistence", "category": "User Created"},
    4722: {"technique": "T1078", "tactic": "Persistence", "category": "User Enabled"},
    4724: {"technique": "T1098", "tactic": "Persistence", "category": "Password Reset"},
    4728: {"technique": "T1098", "tactic": "Persistence", "category": "Member Added to Security Group"},
    4732: {"technique": "T1098", "tactic": "Persistence", "category": "Member Added to Local Group"},
    4756: {"technique": "T1098", "tactic": "Persistence", "category": "Member Added to Universal Group"},
    7045: {"technique": "T1543.003", "tactic": "Persistence", "category": "Service Installed"},
    1102: {"technique": "T1070", "tactic": "Defense Evasion", "category": "Audit Log Cleared"},
    # Sysmon events
    1: {"technique": "T1059", "tactic": "Execution", "category": "Process Creation"},
    3: {"technique": "T1071", "tactic": "Command and Control", "category": "Network Connection"},
    7: {"technique": "T1105", "tactic": "Command and Control", "category": "Image Loaded"},
    8: {"technique": "T1055", "tactic": "Defense Evasion", "category": "CreateRemoteThread"},
    10: {"technique": "T1003", "tactic": "Credential Access", "category": "Process Access"},
    11: {"technique": "T1105", "tactic": "Command and Control", "category": "File Created"},
    12: {"technique": "T1070", "tactic": "Defense Evasion", "category": "Registry Event"},
    13: {"technique": "T1070", "tactic": "Defense Evasion", "category": "Registry Event"},
}


def get_mitre_mapping(event_id: int) -> dict:
    """Get MITRE ATT&CK mapping for a Windows Event ID."""
    return MITRE_EVENT_MAPPING.get(event_id, {})
```

### 2.2 Create Entity Extraction Module

**Create backend/app/services/entity_extractor.py:**
```python
"""Extract entities from raw timeline events."""

import re
import ipaddress
from typing import Optional
from urllib.parse import urlparse


# Regex patterns
IPV4_PATTERN = re.compile(r'\b(?:\d{1,3}\.){3}\d{1,3}\b')
IPV6_PATTERN = re.compile(r'\b(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\b')
DOMAIN_PATTERN = re.compile(r'\b(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}\b')
EMAIL_PATTERN = re.compile(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b')
HASH_MD5_PATTERN = re.compile(r'\b[a-fA-F0-9]{32}\b')
HASH_SHA1_PATTERN = re.compile(r'\b[a-fA-F0-9]{40}\b')
HASH_SHA256_PATTERN = re.compile(r'\b[a-fA-F0-9]{64}\b')
FILE_PATH_PATTERN = re.compile(r'[A-Z]:\\(?:[^\\/:*?"<>|\r\n]+\\)*[^\\/:*?"<>|\r\n]*', re.IGNORECASE)
URL_PATTERN = re.compile(r'https?://[^\s<>"{}|\\^`\[\]]+')
USER_PATTERN = re.compile(r'(?:SubjectUserName|TargetUserName|AccountName|UserName|User):\s*([^\s,.;]+)', re.IGNORECASE)
SID_PATTERN = re.compile(r'\bS-1-5-21-\d+-\d+-\d+-\d+\b')


def extract_ips(text: str) -> list[str]:
    """Extract IPv4 addresses from text."""
    if not text:
        return []
    return IPV4_PATTERN.findall(text)


def extract_domains(text: str) -> list[str]:
    """Extract domain names from text."""
    if not text:
        return []
    domains = DOMAIN_PATTERN.findall(text)
    return [d for d in domains if not d.lower().endswith(('.exe', '.dll', '.sys', '.csv', '.log'))]


def extract_hashes(text: str) -> dict[str, str]:
    """Extract file hashes from text."""
    hashes = {}
    if HASH_MD5_PATTERN.search(text):
        hashes['md5'] = HASH_MD5_PATTERN.search(text).group()
    if HASH_SHA1_PATTERN.search(text):
        hashes['sha1'] = HASH_SHA1_PATTERN.search(text).group()
    if HASH_SHA256_PATTERN.search(text):
        hashes['sha256'] = HASH_SHA256_PATTERN.search(text).group()
    return hashes


def extract_file_paths(text: str) -> list[str]:
    """Extract Windows file paths from text."""
    if not text:
        return []
    return FILE_PATH_PATTERN.findall(text)


def extract_users(text: str) -> list[str]:
    """Extract usernames from event data."""
    if not text:
        return []
    return USER_PATTERN.findall(text)


def extract_sids(text: str) -> list[str]:
    """Extract Windows SIDs from text."""
    if not text:
        return []
    return SID_PATTERN.findall(text)


def is_private_ip(ip: str) -> bool:
    """Check if an IP address is private/RFC1918."""
    try:
        return ipaddress.ip_address(ip).is_private
    except ValueError:
        return False


def extract_all_entities(text: str) -> dict:
    """Extract all entities from text."""
    return {
        "ips": extract_ips(text),
        "domains": extract_domains(text),
        "hashes": extract_hashes(text),
        "file_paths": extract_file_paths(text),
        "users": extract_users(text),
        "sids": extract_sids(text),
    }
```

### 2.3 Create Enrichment Pipeline

**Create backend/app/services/enrichment_service.py:**
```python
"""Enrichment service for timeline events."""

import logging
from typing import Optional
from datetime import datetime, timezone

from app.services.entity_extractor import (
    extract_all_entities,
    is_private_ip,
)
from app.services.timeline_schema import (
    UnifiedEvent,
    SOURCE_NAMES,
    get_mitre_mapping,
)

logger = logging.getLogger(__name__)


def enrich_event(event: UnifiedEvent) -> UnifiedEvent:
    """Apply all enrichment steps to an event."""
    
    # 1. Extract entities from message
    entities = extract_all_entities(event.message)
    
    # 2. Update entity fields if not already set
    if not event.source_ip and entities["ips"]:
        for ip in entities["ips"]:
            if not is_private_ip(ip):
                event.source_ip = ip
                break
        if not event.source_ip:
            event.source_ip = entities["ips"][0]
    
    if not event.dest_ip and len(entities["ips"]) > 1:
        event.dest_ip = entities["ips"][1]
    
    if not event.actor and entities["users"]:
        event.actor = entities["users"][0]
    
    if not event.hashes and entities["hashes"]:
        event.hashes = entities["hashes"]
    
    # 3. MITRE ATT&CK mapping
    if event.event_id and not event.mitre_technique:
        mitre = get_mitre_mapping(event.event_id)
        if mitre:
            event.mitre_technique = mitre.get("technique", "")
            event.mitre_tactic = mitre.get("tactic", "")
            if not event.category:
                event.category = mitre.get("category", "")
    
    # 4. Severity scoring
    event.severity = calculate_severity(event)
    
    # 5. Confidence scoring
    event.confidence = calculate_confidence(event)
    
    # 6. Generate tags
    event.tags = generate_tags(event)
    
    # 7. Generate unique event ID for dedup
    if not event.event_id_unique:
        event.event_id_unique = generate_event_id(event)
    
    return event


def calculate_severity(event: UnifiedEvent) -> str:
    """Calculate event severity based on multiple factors."""
    score = 0
    
    if event.mitre_technique:
        score += 3
    
    critical_events = {4625, 4672, 4697, 4698, 4720, 4728, 4732, 4756, 1102}
    if event.event_id in critical_events:
        score += 3
    
    if event.source_short == "SIGMA":
        score += 2
    
    if event.dest_ip and not is_private_ip(event.dest_ip):
        score += 1
    
    priv_escalation_keywords = ["admin", "system", "privilege", "elevated", "UAC"]
    if any(kw in event.message.lower() for kw in priv_escalation_keywords):
        score += 2
    
    if score >= 7:
        return "critical"
    elif score >= 5:
        return "high"
    elif score >= 3:
        return "medium"
    else:
        return "low"


def calculate_confidence(event: UnifiedEvent) -> float:
    """Calculate confidence score for the event."""
    confidence = 0.5
    
    if event.event_id:
        confidence += 0.2
    if event.mitre_technique:
        confidence += 0.1
    if event.actor:
        confidence += 0.1
    if event.source_ip:
        confidence += 0.05
    if event.hashes:
        confidence += 0.05
    
    return min(1.0, confidence)


def generate_tags(event: UnifiedEvent) -> list[str]:
    """Generate tags based on event characteristics."""
    tags = []
    
    if event.source_short:
        tags.append(event.source_short.lower())
    if event.mitre_technique:
        tags.append(f"mitre:{event.mitre_technique}")
    if event.mitre_tactic:
        tags.append(f"tactic:{event.mitre_tactic.lower().replace(' ', '-')}")
    if event.source_ip:
        tags.append("internal" if is_private_ip(event.source_ip) else "external")
    if event.action:
        tags.append(f"action:{event.action}")
    if event.result == "success":
        tags.append("success")
    elif event.result == "failure":
        tags.append("failure")
    
    return list(set(tags))


def generate_event_id(event: UnifiedEvent) -> str:
    """Generate unique event ID for deduplication."""
    import hashlib
    key = f"{event.timestamp}|{event.source_short}|{event.computer}|{event.event_id}|{event.actor}|{event.target}"
    return hashlib.sha256(key.encode()).hexdigest()[:16]
```

### 2.4 Update Timesketch Export to Use Unified Schema

**Modify backend/app/services/timesketch_export_service.py:**

Add new function:
```python
def export_to_unified_jsonl(
    parsed_dir: Path,
    sigma_dir: Path,
    timeline_dir: Path,
    incident_id: str,
) -> int:
    """Export parsed events to unified JSONL format with enrichment."""
    from app.services.enrichment_service import enrich_event
    from app.services.timeline_schema import UnifiedEvent, SOURCE_NAMES
    
    timeline_dir.mkdir(parents=True, exist_ok=True)
    output_path = timeline_dir / "timeline.jsonl"
    
    events = []
    
    for csv_file in parsed_dir.rglob("*.csv"):
        source_type = detect_source_type(csv_file)
        with open(csv_file, encoding="utf-8-sig", errors="replace", newline="") as f:
            reader = csv.DictReader(f)
            for row in reader:
                event = parse_row_to_unified(row, source_type, incident_id)
                if event:
                    event = enrich_event(event)
                    events.append(event)
    
    with open(output_path, "w", encoding="utf-8") as f:
        for event in events:
            f.write(json.dumps(event.to_dict(), default=str) + "\n")
    
    return len(events)
```

---

## PART 3 — CORRELATION ENGINE

### 3.1 Create Correlation Rules Module

**Create backend/app/services/correlation_engine.py:**
```python
"""Correlation engine for cross-event pattern detection."""

import logging
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import uuid4

import duckdb

logger = logging.getLogger(__name__)


CORRELATION_RULES = [
    {
        "id": "brute_force_pattern",
        "name": "Brute Force Attack Pattern",
        "description": "Multiple failed logons followed by successful logon",
        "severity": "high",
        "mitre_technique": "T1110",
        "mitre_tactic": "Credential Access",
        "query": """
            WITH failed_logons AS (
                SELECT host, event_dt, actor
                FROM timeline_events
                WHERE event_id = 4625
                  AND event_dt >= NOW() - INTERVAL 1 HOUR
            ),
            success_logons AS (
                SELECT host, event_dt, actor
                FROM timeline_events
                WHERE event_id = 4624
                  AND event_dt >= NOW() - INTERVAL 1 HOUR
            )
            SELECT 
                f.actor,
                f.host,
                COUNT(DISTINCT f.event_dt) as failed_count,
                MIN(f.event_dt) as first_failed,
                MAX(s.event_dt) as first_success
            FROM failed_logons f
            JOIN success_logons s ON f.actor = s.actor AND f.host = s.host
            GROUP BY f.actor, f.host
            HAVING COUNT(DISTINCT f.event_dt) >= 5
        """
    },
    {
        "id": "lateral_movement_rdp",
        "name": "RDP Lateral Movement",
        "description": "Same user logging into multiple hosts via RDP in short window",
        "severity": "critical",
        "mitre_technique": "T1021.001",
        "mitre_tactic": "Lateral Movement",
        "query": """
            SELECT 
                actor,
                COUNT(DISTINCT host) as host_count,
                list(DISTINCT host) as hosts,
                MIN(event_dt) as first_seen,
                MAX(event_dt) as last_seen
            FROM timeline_events
            WHERE event_id = 4624
              AND message ILIKE '%logon type%10%'
              AND event_dt >= NOW() - INTERVAL 6 HOUR
              AND actor NOT IN ('-', 'SYSTEM', 'ANONYMOUS LOGON')
              AND NOT ends_with(actor, '$')
            GROUP BY actor
            HAVING COUNT(DISTINCT host) >= 3
        """
    },
    {
        "id": "persistence_scheduled_task",
        "name": "Scheduled Task Persistence",
        "description": "Scheduled task created and executed",
        "severity": "high",
        "mitre_technique": "T1053.005",
        "mitre_tactic": "Persistence",
        "query": """
            SELECT 
                host,
                actor,
                list(event_id) as event_ids,
                MIN(event_dt) as first_seen,
                MAX(event_dt) as last_seen
            FROM timeline_events
            WHERE event_id IN (4698, 4699, 4702)
              AND event_dt >= NOW() - INTERVAL 24 HOUR
            GROUP BY host, actor
            HAVING list_contains(list(event_id), 4698)
        """
    },
    {
        "id": "defense_evasion_log_clear",
        "name": "Audit Log Cleared",
        "description": "Security audit log was cleared",
        "severity": "critical",
        "mitre_technique": "T1070",
        "mitre_tactic": "Defense Evasion",
        "query": """
            SELECT 
                host,
                actor,
                event_dt,
                message
            FROM timeline_events
            WHERE event_id = 1102
              AND event_dt >= NOW() - INTERVAL 24 HOUR
        """
    },
    {
        "id": "privilege_escalation",
        "name": "Privilege Escalation",
        "description": "User added to privileged group or granted admin rights",
        "severity": "high",
        "mitre_technique": "T1078",
        "mitre_tactic": "Privilege Escalation",
        "query": """
            SELECT 
                host,
                actor,
                target,
                event_dt,
                message
            FROM timeline_events
            WHERE event_id IN (4728, 4732, 4756)
              AND event_dt >= NOW() - INTERVAL 24 HOUR
        """
    },
]


def run_correlation(duckdb_path: Path, incident_id: str) -> list[dict[str, Any]]:
    """Run all correlation rules against the super timeline."""
    detections = []
    
    con = duckdb.connect(str(duckdb_path), read_only=True)
    try:
        for rule in CORRELATION_RULES:
            try:
                results = con.execute(rule["query"]).fetchall()
                for row in results:
                    detections.append({
                        "id": str(uuid4()),
                        "incident_id": incident_id,
                        "detection_type": rule["id"],
                        "rule_name": rule["name"],
                        "description": rule["description"],
                        "severity": rule["severity"],
                        "mitre_technique": rule["mitre_technique"],
                        "mitre_tactic": rule["mitre_tactic"],
                        "source_host": row[0] if row else "",
                        "actor": row[1] if len(row) > 1 else "",
                        "first_seen": str(row[-2]) if len(row) > 2 else "",
                        "last_seen": str(row[-1]) if len(row) > 2 else "",
                        "confidence": 0.8,
                        "details": {"rule_id": rule["id"], "raw_result": str(row)},
                    })
            except Exception as exc:
                logger.warning("Correlation rule %s failed: %s", rule["id"], exc)
    finally:
        con.close()
    
    return detections
```

---

## PART 4 — SIEM EXPORT FORMATS

### 4.1 Create Export Service

**Create backend/app/services/siem_export_service.py:**
```python
"""SIEM export service — export timeline events in various SIEM formats."""

import json
import logging
from pathlib import Path
from typing import Optional

import duckdb

from app.services.timeline_schema import UnifiedEvent

logger = logging.getLogger(__name__)


def export_to_cef(duckdb_path: Path, output_path: Path, incident_id: str) -> int:
    """Export timeline to CEF (Common Event Format) for ArcSight, QRadar, etc."""
    con = duckdb.connect(str(duckdb_path), read_only=True)
    try:
        rows = con.execute("""
            SELECT event_dt, source_short, computer, event_id, message,
                   actor, source_ip, dest_ip, severity
            FROM timeline_events
            WHERE event_dt IS NOT NULL
            ORDER BY event_dt
        """).fetchall()
        
        count = 0
        with open(output_path, "w", encoding="utf-8") as f:
            for row in rows:
                event = UnifiedEvent(
                    timestamp=str(row[0]),
                    source_short=row[1] or "",
                    computer=row[2] or "",
                    event_id=row[3],
                    message=row[4] or "",
                    actor=row[5] or "",
                    source_ip=row[6] or "",
                    dest_ip=row[7] or "",
                    severity=row[8] or "low",
                )
                f.write(event.to_cef() + "\n")
                count += 1
        
        return count
    finally:
        con.close()


def export_to_leef(duckdb_path: Path, output_path: Path, incident_id: str) -> int:
    """Export timeline to LEEF (Log Event Extended Format) for QRadar."""
    con = duckdb.connect(str(duckdb_path), read_only=True)
    try:
        rows = con.execute("""
            SELECT event_dt, source_short, computer, event_id, message,
                   actor, source_ip, dest_ip, severity
            FROM timeline_events
            WHERE event_dt IS NOT NULL
            ORDER BY event_dt
        """).fetchall()
        
        count = 0
        with open(output_path, "w", encoding="utf-8") as f:
            for row in rows:
                event = UnifiedEvent(
                    timestamp=str(row[0]),
                    source_short=row[1] or "",
                    computer=row[2] or "",
                    event_id=row[3],
                    message=row[4] or "",
                    actor=row[5] or "",
                    source_ip=row[6] or "",
                    dest_ip=row[7] or "",
                    severity=row[8] or "low",
                )
                f.write(event.to_leef() + "\n")
                count += 1
        
        return count
    finally:
        con.close()


def export_to_stix(duckdb_path: Path, output_path: Path, incident_id: str) -> int:
    """Export timeline to STIX 2.1 format for threat intel sharing."""
    con = duckdb.connect(str(duckdb_path), read_only=True)
    try:
        rows = con.execute("""
            SELECT event_dt, source_short, computer, event_id, message,
                   actor, source_ip, dest_ip, severity, mitre_technique
            FROM timeline_events
            WHERE event_dt IS NOT NULL
              AND (severity IN ('high', 'critical') OR mitre_technique != '')
            ORDER BY event_dt
        """).fetchall()
        
        stix_objects = []
        for row in rows:
            stix_objects.append({
                "type": "indicator",
                "spec_version": "2.1",
                "id": f"indicator--{uuid4()}",
                "created": str(row[0]),
                "modified": str(row[0]),
                "name": f"{row[1]} Event {row[3]} on {row[2]}",
                "description": row[4][:500] if row[4] else "",
                "pattern": f"[network-traffic:dest_ip = '{row[7]}']" if row[7] else "",
                "pattern_type": "stix",
                "valid_from": str(row[0]),
                "labels": [row[1].lower(), row[8]],
                "external_references": [{
                    "source_name": "mitre-attack",
                    "url": f"https://attack.mitre.org/techniques/{row[9]}/" if row[9] else "",
                }] if row[9] else [],
            })
        
        bundle = {
            "type": "bundle",
            "id": f"bundle--{uuid4()}",
            "objects": stix_objects,
        }
        
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(bundle, f, indent=2, default=str)
        
        return len(stix_objects)
    finally:
        con.close()
```

---

## PART 5 — API ENDPOINTS FOR NEW FEATURES

### 5.1 Add Export Endpoints

**Add to backend/app/api/v1/endpoints/evidence.py:**

```python
@router.get("/super-timeline/{incident_id}/export")
async def export_super_timeline(
    incident_id: str,
    format: str = Query(default="jsonl", enum=["jsonl", "cef", "leef", "stix", "csv"]),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Export super timeline in various SIEM formats."""
    from app.services.siem_export_service import export_to_cef, export_to_leef, export_to_stix
    from app.services.system_settings_service import get_runtime_settings
    
    _validate_incident_id(incident_id)
    
    settings = await get_runtime_settings(db)
    evidence_base = Path(settings.evidence_storage_path)
    duckdb_path = evidence_base / incident_id / "super_timeline.duckdb"
    
    if not duckdb_path.exists():
        raise HTTPException(status_code=404, detail="Super timeline not found")
    
    export_dir = evidence_base / incident_id / "exports"
    export_dir.mkdir(parents=True, exist_ok=True)
    
    if format == "cef":
        output_path = export_dir / f"timeline_{incident_id}.cef"
        count = await asyncio.to_thread(export_to_cef, duckdb_path, output_path, incident_id)
    elif format == "leef":
        output_path = export_dir / f"timeline_{incident_id}.leef"
        count = await asyncio.to_thread(export_to_leef, duckdb_path, output_path, incident_id)
    elif format == "stix":
        output_path = export_dir / f"timeline_{incident_id}.stix.json"
        count = await asyncio.to_thread(export_to_stix, duckdb_path, output_path, incident_id)
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported format: {format}")
    
    return FileResponse(
        path=str(output_path),
        filename=output_path.name,
        media_type="application/octet-stream",
    )
```

### 5.2 Add Correlation Endpoint

**Add to backend/app/api/v1/endpoints/processing.py:**

```python
@router.get("/incident/{incident_id}/correlations")
async def get_correlations(
    incident_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[dict]:
    """Run correlation engine and return detections."""
    from app.services.correlation_engine import run_correlation
    from app.services.system_settings_service import get_runtime_settings
    
    settings = await get_runtime_settings(db)
    evidence_base = Path(settings.evidence_storage_path)
    duckdb_path = evidence_base / incident_id / "super_timeline.duckdb"
    
    if not duckdb_path.exists():
        raise HTTPException(status_code=404, detail="Super timeline not found")
    
    detections = await asyncio.to_thread(run_correlation, duckdb_path, incident_id)
    return detections
```

---

## PART 6 — TESTING & VERIFICATION

### 6.1 Run Existing Tests
```bash
cd backend
DFIR_TEST_DATABASE_URL=postgresql+asyncpg://dfir:dfir@localhost:5432/dfir_test python -m pytest tests/ -v --tb=short
```

### 6.2 Verify Docker Build
```bash
docker compose build --no-cache
docker compose up -d
docker compose ps  # All services should be healthy
```

### 6.3 Verify WebSocket
```bash
wscat -c ws://localhost/api/v1/agent-commands/ws/test?token=<JWT>
# Should connect without 400 error
```

### 6.4 Verify Frontend Healthcheck
```bash
docker compose ps frontend
# Status should be "healthy" not "unhealthy"
```

---

## PART 7 — GAP ANALYSIS (MANDATORY AFTER IMPLEMENTATION)

After all implementations are complete, perform a comprehensive gap analysis:

### 7.1 Security Gap Analysis
- [ ] All TLS keys rotated and purged from git
- [ ] .dockerignore files in place for all build contexts
- [ ] Volume ownership fixed with init container
- [ ] WebSocket upgrade working through Nginx
- [ ] Frontend healthcheck passing
- [ ] No secrets in environment variables or code
- [ ] Rate limiting on all sensitive endpoints

### 7.2 Functional Gap Analysis
- [ ] Unified schema applied to all source types
- [ ] Enrichment pipeline running (MITRE mapping, entity extraction)
- [ ] Correlation engine returning detections
- [ ] SIEM export formats working (CEF, LEEF, STIX)
- [ ] Deduplication functioning
- [ ] Super timeline building successfully

### 7.3 Documentation Gap Analysis
- [ ] FORENSICS_TOOLS.md created
- [ ] API documentation updated for new endpoints
- [ ] Deployment guide updated with new requirements
- [ ] Changelog updated

### 7.4 Output Format
Produce a final report with:
1. Summary of changes made
2. Test results
3. Remaining gaps (if any)
4. Recommendations for next iteration

---

## IMPORTANT NOTES

1. **Read existing code first** — Understand the current implementation before making changes
2. **Maintain backward compatibility** — Don't break existing APIs without deprecation
3. **Test incrementally** — Verify each change before moving to the next
4. **Document as you go** — Update comments and docstrings
5. **Follow existing patterns** — Match the code style of the current codebase
6. **Use the existing models** — Don't create new database tables unless absolutely necessary
7. **Keep changes minimal** — Only change what's needed to implement the feature

## START HERE

1. Read CODEX.md for project overview
2. Read docker-compose.yml for infrastructure
3. Read backend/app/services/artifact_parser_service.py for pipeline
4. Read backend/app/services/super_timeline_service.py for timeline
5. Read backend/app/services/timesketch_export_service.py for export
6. Start with Part 1 (Security Hardening) — these are critical
7. Then Part 2 (Schema Normalization)
8. Then Part 3 (Correlation Engine)
9. Then Part 4 (SIEM Export)
10. Finish with Part 7 (Gap Analysis)
```

---

## Cara Pakai

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
Paste prompt ke Claude.

### Cursor IDE
Buka folder project, Ctrl+L / Cmd+L, paste prompt.

### ChatGPT / GPT-4
Paste prompt langsung ke chat.

---

## Tips untuk Hasil Terbaik

1. **Jalankan per part** — Jangan sekaligus, selesaikan Part 1 dulu, test, lalu lanjut
2. **Commit per change** — git commit setelah setiap fix agar bisa rollback jika perlu
3. **Test setiap fix** — Jangan lanjut ke next fix sebelum fix sebelumnya terverifikasi
4. **Baca error messages** — Jika ada error, baca sebelum mencoba fix tambahan
5. **Gap analysis di akhir** — Wajib dilakukan untuk memastikan tidak ada yang terlewat

---


