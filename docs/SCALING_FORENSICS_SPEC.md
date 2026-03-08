# Scaling Forensics Pipeline — Feature Specification

## Visi

Setelah artifacts berhasil dikumpulkan dan di-lock oleh agent, sistem secara otomatis menjalankan pipeline tiga tahap:

1. **Parsing** — EZ Tools (Eric Zimmerman) mem-parse artifacts mentah (EVTX, MFT, Registry Hive, Prefetch, dll.) menjadi CSV/JSON terstruktur
2. **Detection** — Sigma rules dijalankan terhadap hasil parsing untuk menghasilkan deteksi/hits dengan severity
3. **Timeline** — Semua parsed output dikonversi ke format Timesketch JSONL, menghasilkan satu timeline yang siap diimpor untuk analisis skala besar

Pipeline ini berjalan **di background setelah evidence di-lock** — tidak mengganggu alur koleksi yang sudah ada.

---

## Arsitektur Keseluruhan

```
[Agent Upload → LOCKED]
        │
        ▼
[Phase 1: EZ Tools Parsing]          /vault/evidence/{incident}/{job}/parsed/
  EvtxECmd  → security.evtx → CSV    parsed/evtx/
  MFTECmd   → $MFT          → CSV    parsed/mft/
  MFTECmd   → $J (UsnJrnl)  → CSV    parsed/usnjrnl/
  RECmd     → *.hve          → CSV    parsed/registry/
  PECmd     → *.pf           → CSV    parsed/prefetch/
  LECmd     → *.lnk          → CSV    parsed/lnk/
  WxTCmd    → jumplists      → CSV    parsed/jumplists/
  AmcacheParser → amcache    → CSV    parsed/amcache/
        │
        ▼
[Phase 2: Sigma Detection]           /vault/evidence/{incident}/{job}/sigma/
  chainsaw → EVTX + Sigma rules → sigma_hits.jsonl
  hayabusa → EVTX → hayabusa_timeline.csv
  (pySigma → CSV artifacts, future)
        │
        ▼
[Phase 3: Timeline Aggregation]      /vault/evidence/{incident}/{job}/timeline/
  Merge all parsed CSVs + sigma hits
  → timeline.jsonl  (Timesketch format)
  → [Optional] POST ke Timesketch API
```

**Integration point:** `upload_job_evidence()` di `agents.py` — setelah `write_lock_marker()` dipanggil, tambahkan `asyncio.create_task(trigger_processing_pipeline(incident_id, job_id, db))`.

---

## Komponen Baru yang Harus Dibangun

### 1. DB Models (baru)

#### `ProcessingJob` — `backend/app/models/processing.py`
```
id              String PK
incident_id     String FK → incidents.id
job_id          String FK → jobs.id (evidence folder)
status          String  — PENDING | RUNNING | DONE | FAILED
phase           String  — parsing | sigma | timeline
started_at      DateTime nullable
completed_at    DateTime nullable
error_message   String nullable
created_at      DateTime server_default now()
```

#### `SigmaHit` — tambah ke `backend/app/models/processing.py`
```
id              String PK
incident_id     String FK → incidents.id
processing_job_id String FK → processing_jobs.id
rule_id         String  — Sigma rule ID (UUID)
rule_name       String
rule_tags       ARRAY(String)   — e.g. ["attack.t1059", "attack.execution"]
severity        String  — critical | high | medium | low | informational
description     String
artifact_file   String  — relative path dari evidence folder
event_timestamp DateTime nullable
event_record_id String nullable
event_data      JSON    — raw event fields
detected_at     DateTime server_default now()
```

**Migration:** Buat `backend/alembic/versions/20260401_add_processing_pipeline.py`
- `down_revision = "20260303_add_concurrency_limit"`
- Buat tabel `processing_jobs` dan `sigma_hits`

---

### 2. Backend Services (baru)

#### `backend/app/services/artifact_parser_service.py`
Orkestrator utama pipeline. Fungsi yang harus ada:
- `async def run_parsing_pipeline(incident_id, job_id, evidence_dir, db)` — entry point
- `async def run_ez_tools(evidence_dir, output_dir)` → jalankan EZ Tools via subprocess async
- `_map_artifacts_to_tools(evidence_dir)` → scan extracted/ dan kembalikan list `(tool, input_path, output_dir)`
- `async def run_sigma_detection(evidence_dir, sigma_output_dir)` → chainsaw/hayabusa
- `async def run_timeline_aggregation(parsed_dir, sigma_dir, output_dir, incident_meta)` → merge ke JSONL

#### `backend/app/services/timesketch_export_service.py`
- `def convert_row_to_jsonl(row, source, timestamp_desc, hostname)` → Timesketch JSONL line
- `async def push_to_timesketch(timeline_path, sketch_name, timesketch_url, timesketch_token)` → opsional

---

### 3. CRUD (baru)

#### `backend/app/crud/processing.py`
- `create_processing_job(db, incident_id, job_id)` → buat record PENDING
- `update_processing_job(db, job_id, status, phase, error)` → update status
- `get_processing_job(db, job_id)` → ambil record
- `list_sigma_hits(db, incident_id, severity=None, limit=100, offset=0)` → paginated
- `create_sigma_hits_bulk(db, hits: list[SigmaHitCreate])` → batch insert

---

### 4. Schemas (baru)

#### `backend/app/schemas/processing.py`
```python
class ProcessingJobOut(BaseModel):
    id: str
    incident_id: str
    job_id: str
    status: str
    phase: str | None
    started_at: datetime | None
    completed_at: datetime | None
    error_message: str | None

class SigmaHitOut(BaseModel):
    id: str
    incident_id: str
    rule_id: str
    rule_name: str
    rule_tags: list[str]
    severity: str
    description: str
    artifact_file: str
    event_timestamp: datetime | None
    event_record_id: str | None
    event_data: dict
    detected_at: datetime
```

---

### 5. API Endpoints (baru)

**File:** `backend/app/api/v1/endpoints/processing.py`

| Method | Path | Role | Fungsi |
|--------|------|------|--------|
| `POST` | `/processing/{job_id}/trigger` | operator/admin | Trigger pipeline secara manual |
| `GET`  | `/processing/{job_id}/status` | semua | Poll status pipeline |
| `GET`  | `/incidents/{id}/sigma-hits` | semua | List deteksi dengan filter `?severity=high` |
| `GET`  | `/incidents/{id}/timeline/download` | semua | Download `timeline.jsonl` |
| `POST` | `/incidents/{id}/timeline/push-timesketch` | admin | Push ke Timesketch instance |

Daftarkan di `backend/app/api/v1/api.py`:
```python
from app.api.v1.endpoints import processing
router.include_router(processing.router, prefix="/processing", tags=["processing"])
```

**Auto-trigger:** Di `agents.py`, setelah `write_lock_marker()` di `upload_job_evidence()`:
```python
from app.services.artifact_parser_service import run_parsing_pipeline
asyncio.create_task(run_parsing_pipeline(job.incident_id, job.id, base_path, db))
```

---

### 6. System Settings (tambahan)

Tambah fields baru ke `SystemSettings` model dan schema:
```
ez_tools_path      String  default "/opt/eztools"
chainsaw_path      String  default "/usr/local/bin/chainsaw"
sigma_rules_path   String  default "/opt/sigma-rules"
timesketch_url     String nullable  — URL instance Timesketch
timesketch_token   String nullable  — API token
auto_process       Boolean default True — trigger otomatis setelah lock
```

Buat migration untuk kolom-kolom ini di file migration baru.

---

### 7. Docker Compose (baru: processor container)

```yaml
# docker-compose.yml — tambah service baru
processor:
  build:
    context: ./processor
    dockerfile: Dockerfile
  volumes:
    - evidence_vault:/vault/evidence
    - sigma_rules:/opt/sigma-rules
  environment:
    - DATABASE_URL=${DATABASE_URL}
    - EVIDENCE_STORAGE_PATH=/vault/evidence
    - EZ_TOOLS_PATH=/opt/eztools
    - CHAINSAW_PATH=/usr/local/bin/chainsaw
  depends_on:
    - db
```

**`processor/Dockerfile`:**
```dockerfile
FROM python:3.12-slim

# .NET runtime untuk EZ Tools
RUN apt-get update && apt-get install -y wget curl && \
    wget https://dot.net/v1/dotnet-install.sh && \
    bash dotnet-install.sh --channel 8.0 --install-dir /usr/local/dotnet
ENV DOTNET_ROOT=/usr/local/dotnet
ENV PATH=$PATH:/usr/local/dotnet

# chainsaw (Rust binary)
RUN wget -O /tmp/chainsaw.tar.gz \
    https://github.com/WithSecureLabs/chainsaw/releases/latest/download/chainsaw_x86_64-unknown-linux-gnu.tar.gz && \
    tar -xzf /tmp/chainsaw.tar.gz -C /usr/local/bin/

# EZ Tools (pre-built .NET dlls)
COPY eztools/ /opt/eztools/

# Python deps
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . /app
WORKDIR /app
```

**Alternatif tanpa container terpisah:** Jalankan subprocess dari backend container yang sudah memiliki semua binary. Lebih sederhana untuk v1.

---

## EZ Tools — Mapping Artifacts ke Tools

```python
# backend/app/services/artifact_parser_service.py

EZ_TOOL_MAP = [
    # (glob_pattern_in_extracted, tool_name, tool_args_template)
    ("**/*.evtx",          "EvtxECmd",          "{tool} -f {input} --csv {out_dir} --csvf {stem}.csv"),
    ("**/$MFT",            "MFTECmd",           "{tool} -f {input} --csv {out_dir} --csvf mft.csv"),
    ("**/$J",              "MFTECmd",           "{tool} -f {input} --csv {out_dir} --csvf usnjrnl.csv"),
    ("**/*.hve",           "RECmd",             "{tool} -f {input} --bn {batch_dir}/RECmd_Batch_MC.reb --csv {out_dir}"),
    ("**/Prefetch/*.pf",   "PECmd",             "{tool} -d {input_dir} --csv {out_dir} --csvf prefetch.csv"),
    ("**/*.lnk",           "LECmd",             "{tool} -d {input_dir} --csv {out_dir} --csvf lnk.csv"),
    ("**/AutomaticDestinations/*.automaticDestinations-ms",
                           "WxTCmd",            "{tool} -d {input_dir} --csv {out_dir}"),
    ("**/Amcache.hve",     "AmcacheParser",     "{tool} -f {input} --csv {out_dir} --csvf amcache.csv"),
    ("**/AppCompatCache*", "AppCompatCacheParser", "{tool} -f {input} --csv {out_dir}"),
]
```

**Catatan penting tentang EZ Tools di Linux:**
- EZ Tools adalah .NET DLL — bisa dijalankan dengan `dotnet /opt/eztools/EvtxECmd/EvtxECmd.dll -f ...`
- Download dari: https://ericzimmerman.github.io/#!index.md (pilih yang `.net6` atau `.net8`)
- `Get-ZimmermanTools.ps1` bisa dipakai untuk download semua tools sekaligus

---

## Sigma Detection — Chainsaw

```bash
# Command yang dijalankan via subprocess:
chainsaw hunt {evtx_dir} \
    --sigma {sigma_rules_path}/rules/windows/ \
    --mapping {sigma_rules_path}/tools/chainsaw/sigma-event-logs-all.yml \
    --json \
    --output {sigma_output_dir}/chainsaw_hits.json

# Alternative: Hayabusa (lebih lengkap output CSV)
hayabusa csv-timeline \
    -d {evtx_dir} \
    -o {sigma_output_dir}/hayabusa_timeline.csv \
    --no-wizard
```

**Sigma rules source:** https://github.com/SigmaHQ/sigma — clone sebagai git submodule:
```bash
cd dfir-collection-kit
git submodule add https://github.com/SigmaHQ/sigma.git sigma-rules
```

**Parsing chainsaw JSON output → SigmaHit:**
```python
# Setiap entry di chainsaw output:
{
    "name": "Mimikatz Detection",
    "timestamp": "2026-01-01T12:00:00Z",
    "tags": ["attack.credential_access", "attack.t1003"],
    "level": "critical",
    "document": { "EventID": 4688, "CommandLine": "...", ... }
}
```

---

## Timesketch JSONL Format

Setiap baris timeline.jsonl harus memenuhi format ini:
```json
{
  "message": "Process Created: powershell.exe -enc ...",
  "datetime": "2026-01-01T12:00:00+00:00",
  "timestamp_desc": "Event Logged",
  "source": "Windows Security Event Log",
  "source_short": "EVTX",
  "hostname": "DESKTOP-VICTIM",
  "username": "DOMAIN\\\\user",
  "tag": ["sigma-mimikatz", "attack.t1003"],
  "event_id": "4688",
  "incident_id": "INC-20260101-001"
}
```

**Source mapping dari parsed files:**

| Input File | `source` | `source_short` | `timestamp_desc` |
|------------|----------|----------------|------------------|
| EvtxECmd CSV | Windows Event Log: Security/System/Application | EVTX | Event Logged |
| MFTECmd CSV ($MFT) | NTFS Master File Table | MFT | File Created / Modified |
| MFTECmd CSV ($J) | NTFS USN Journal | USNJRNL | USN Record |
| RECmd CSV | Windows Registry | REG | Registry Modified |
| PECmd CSV | Windows Prefetch | PREFETCH | Prefetch Executed |
| LECmd CSV | Windows LNK File | LNK | LNK Created |
| AmcacheParser CSV | Windows Amcache | AMCACHE | Program First Run |
| Chainsaw hits | Sigma Detection | SIGMA | Sigma Hit |

---

## Go Agent — Modul Baru yang Diperlukan

Untuk mendukung parsing MFT dan UsnJrnl, perlu modul koleksi raw NTFS:

### `windows_mft` — `agent/internal/modules/windows_artifacts.go`
```go
// Collect $MFT via VSS shadow copy atau raw copy
// Requires: SeBackupPrivilege (local admin)
// Output: artifacts/windows/mft/$MFT
// Method: robocopy /B dari shadow copy, atau gunakan NTFSReader tool
```

### `windows_usnjrnl` — `agent/internal/modules/windows_artifacts.go`
```go
// Collect $UsnJrnl:$J
// Output: artifacts/windows/usnjrnl/$J
// Method: robocopy /B dari \\.\C:\$Extend\$UsnJrnl
```

**Catatan:** $MFT dan $UsnJrnl adalah locked system files. Pendekatan yang disarankan:
1. Buat VSS shadow copy: `(Get-WmiObject -List Win32_ShadowCopy).Create("C:\", "ClientAccessible")`
2. Copy dari shadow: `robocopy \\?\GLOBALROOT\Device\HarddiskVolumeShadowCopy1\ {output} $MFT /B`
3. Hapus shadow copy setelah selesai

Tambahkan ke `modules.py` MODULE_REGISTRY:
```python
"windows_mft": {
    "os": "windows", "category": "artifacts", "priority": 2,
    "output_relpath": "artifacts/windows/mft/$MFT", "params": {},
},
"windows_usnjrnl": {
    "os": "windows", "category": "artifacts", "priority": 2,
    "output_relpath": "artifacts/windows/usnjrnl/$J", "params": {},
},
```

---

## Frontend — Halaman Baru

### 1. Processing Status — `src/pages/ProcessingStatus.tsx`
Route: `/incidents/:id/processing`

- Tampilkan 3 phase cards: Parsing / Detection / Timeline
- Setiap card punya status badge (PENDING / RUNNING / DONE / FAILED)
- Progress bar per phase
- Error message jika FAILED
- Auto-refresh setiap 3 detik (gunakan `useEffect` + `setTimeout`)
- Button "View Sigma Hits" jika phase detection DONE
- Button "Download Timeline" jika phase timeline DONE

### 2. Sigma Hits Viewer — `src/pages/SigmaHits.tsx`
Route: `/incidents/:id/sigma-hits`

- Header stats: Total hits, breakdown per severity (critical/high/medium/low)
- Filter bar: severity dropdown, free-text search pada rule_name
- Table: rule_name | severity badge | tags | artifact_file | event_timestamp | [detail]
- Detail modal: tampilkan `event_data` sebagai JSON tree
- Export button: download sigma_hits.csv

### 3. Update `CollectionExecution.tsx`
Setelah status collection menjadi `COLLECTION_COMPLETE`, tambahkan section:
```
[Collection Complete]
► Processing started automatically — View Processing Status →
```
Link ke `/incidents/:id/processing`.

### 4. Update `EvidenceVault.tsx`
Pada setiap evidence folder row, tambahkan:
- Badge "Processed" / "Processing" / "Not Processed"
- Link "View Sigma Hits" jika ada hits
- Link "Download Timeline" jika timeline tersedia

### 5. Update `AdminSettings.tsx`
Tambah section "Forensics Processing":
- EZ Tools path
- Chainsaw/Hayabusa binary path
- Sigma rules path
- Timesketch URL + token
- Toggle "Auto-process after collection"

---

## Urutan Implementasi

Kerjakan dalam urutan ini agar setiap session bisa diverifikasi secara independen:

### Session A — Foundation (Backend Core)
1. Buat `backend/app/models/processing.py` (ProcessingJob + SigmaHit)
2. Buat migration `20260401_add_processing_pipeline.py`
3. Buat `backend/app/crud/processing.py`
4. Buat `backend/app/schemas/processing.py`
5. Test: `alembic upgrade head` harus berhasil

### Session B — EZ Tools Parser
1. Buat `backend/app/services/artifact_parser_service.py`
   - Hanya fase parsing dulu (EZ Tools)
   - Gunakan `asyncio.create_subprocess_exec` untuk non-blocking
2. Buat `backend/app/api/v1/endpoints/processing.py`
   - `POST /processing/{job_id}/trigger` (manual trigger)
   - `GET /processing/{job_id}/status`
3. Hook auto-trigger di `agents.py` setelah `write_lock_marker()`
4. Test: upload evidence → cek folder `parsed/` terbentuk

### Session C — Sigma Detection
1. Tambah fase sigma ke `artifact_parser_service.py`
2. Implementasi parsing chainsaw JSON output → `SigmaHit` records
3. `GET /incidents/{id}/sigma-hits` endpoint
4. Test: chainsaw harus menghasilkan hits pada EVTX yang diketahui berbahaya

### Session D — Timeline Export
1. Buat `backend/app/services/timesketch_export_service.py`
2. Implementasi merge semua parsed CSV + sigma hits → `timeline.jsonl`
3. `GET /incidents/{id}/timeline/download` endpoint
4. (Opsional) `POST /incidents/{id}/timeline/push-timesketch`
5. Test: import `timeline.jsonl` ke Timesketch secara manual, verifikasi events muncul

### Session E — System Settings
1. Tambah columns EZ Tools config ke `SystemSettings` model + migration
2. Update `AdminSettings.tsx` dengan form baru
3. Baca config dari DB di `artifact_parser_service.py`

### Session F — Frontend
1. `ProcessingStatus.tsx` dengan auto-refresh
2. `SigmaHits.tsx` dengan filter + detail modal
3. Update `CollectionExecution.tsx` dan `EvidenceVault.tsx`

### Session G — Go Agent Modules (opsional, bisa di-skip jika EZ Tools sudah punya data)
1. `windows_mft` module dengan VSS shadow copy
2. `windows_usnjrnl` module
3. Tambah ke `MODULE_REGISTRY` Python dan `Init()` Go

---

## Dependensi Eksternal & Cara Mendapatkannya

| Tool | Source | Notes |
|------|--------|-------|
| EZ Tools | https://ericzimmerman.github.io/#!index.md | Download .NET6/.NET8 builds; butuh dotnet runtime |
| chainsaw | https://github.com/WithSecureLabs/chainsaw/releases | Rust binary, tersedia untuk Linux x64 |
| hayabusa | https://github.com/Yamato-Security/hayabusa/releases | Alternatif chainsaw, CSV output lebih lengkap |
| Sigma rules | https://github.com/SigmaHQ/sigma | Clone sebagai git submodule |
| Timesketch | https://github.com/google/timesketch | Deploy terpisah; gunakan `timesketch-import-client` Python package |

**Python packages baru (tambah ke `backend/requirements.txt`):**
```
timesketch-import-client  # untuk push ke Timesketch
```

---

## File yang Perlu Dimodifikasi (Existing)

| File | Perubahan |
|------|-----------|
| `backend/app/api/v1/api.py` | Tambah router `processing` |
| `backend/app/api/v1/endpoints/agents.py` | Tambah `asyncio.create_task(run_parsing_pipeline(...))` setelah lock |
| `backend/app/models/__init__.py` | Import ProcessingJob, SigmaHit |
| `backend/app/models/settings.py` | Tambah EZ Tools config columns |
| `backend/app/schemas/settings.py` | Tambah fields baru |
| `backend/app/schemas/incident.py` | Tambah status `PROCESSING` ke IncidentStatus Literal |
| `docker-compose.yml` | Tambah `processor` service (atau volume sigma-rules) |
| `frontend/src/App.tsx` | Tambah routes `/incidents/:id/processing` dan `/incidents/:id/sigma-hits` |

---

## Catatan Arsitektur Penting

1. **Evidence immutability tetap terjaga** — pipeline hanya *membaca* dari `extracted/` dan menulis ke folder baru (`parsed/`, `sigma/`, `timeline/`). Tidak ada modifikasi ke folder yang sudah LOCKED.

2. **Error isolation** — jika EZ Tools gagal pada satu artifact (misal $MFT tidak ada), pipeline tetap lanjut ke artifact berikutnya. Hanya catat error di `ProcessingJob.error_message`. Jangan fail seluruh pipeline karena satu tool gagal.

3. **Chain of Custody** — tambah entry CoC setelah setiap phase selesai:
   - `"ARTIFACT PARSING COMPLETE"` setelah EZ Tools selesai
   - `"SIGMA DETECTION COMPLETE"` setelah Sigma selesai
   - `"TIMELINE GENERATED"` setelah timeline.jsonl dibuat

4. **Async subprocess** — gunakan `asyncio.create_subprocess_exec` (bukan `subprocess.run`) agar backend tidak blocking. Set timeout per tool (default 10 menit).

5. **Resource limits** — EZ Tools (khususnya MFTECmd pada $MFT besar) bisa sangat berat. Pertimbangkan semaphore untuk membatasi concurrent processing jobs.

6. **Timeline size** — $MFT bisa menghasilkan jutaan entries. Pertimbangkan filtering (hanya file created/modified dalam timeframe incident) sebelum memasukkan ke JSONL.

7. **Timesketch integration** — Timesketch adalah service terpisah. Untuk v1, cukup generate `timeline.jsonl` untuk download manual. Push otomatis ke Timesketch adalah fitur opsional (Session D).
