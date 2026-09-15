# Forensics Tools Setup

The Docker images do not bundle third-party parsers. This keeps the image
smaller and avoids redistributing tools under incompatible licenses. The
pipeline reports a clear tool-unavailable result when a requested parser is
not mounted; it does not fabricate analysis output.

## Mounted paths

The default Compose file mounts these repository directories read-only for the
backend and Celery worker. Populate them before running a collection pipeline.

| Tool | Host directory | Container path | Used for |
| --- | --- | --- | --- |
| EZ Tools | `tools/eztools` | `/opt/eztools` | EVTX, MFT, Registry, Prefetch, LNK parsing |
| Hayabusa | `tools/hayabusa` | `/opt/hayabusa` | Sigma-based Windows hunting |
| Chainsaw | `tools/chainsaw` | `/opt/chainsaw` | Rapid EVTX hunting |
| YARA rules | `tools/yara-rules` | `/opt/yara-rules` | File and artifact scanning |

## Installation

1. Download each tool from its official publisher and extract it into the
   matching `tools/` directory. Do not commit downloaded binaries or rule packs
   unless their licenses explicitly permit it.
2. For a local Docker deployment, restart only the services that execute the
   pipeline after updating tools:

   ```powershell
   docker compose up -d --force-recreate backend celery_worker
   ```

3. Confirm the configured paths in **Admin Settings → Forensics Pipeline** and
   run a small test collection. The service logs identify a missing executable
   and the attempted path.

To keep local tool binaries outside the repository, create
`docker-compose.override.yml` and replace the mounts with absolute host paths.
The container paths above must remain unchanged.

## Operational notes

- Mounts are read-only. Parser output and evidence are written only below the
  evidence volume.
- Pin tool releases for repeatable investigations and record versions in the
  case notes or chain-of-custody record.
- Validate rule sources before using them in production; a rule hit is an
  investigative lead, not proof of compromise.
