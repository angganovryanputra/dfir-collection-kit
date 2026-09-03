# Forensics Tool Mounts

Docker Compose mounts these directories read-only into the backend and Celery
worker.  Place licensed binaries and rules here before enabling the related
pipeline features:

- `eztools/` → `/opt/eztools`
- `hayabusa/` → `/opt/hayabusa`
- `chainsaw/` → `/opt/chainsaw` (including `rules/`)
- `yara-rules/` → `/opt/yara-rules`

The tool binaries and third-party rules are intentionally not versioned in this
repository.  Configure the corresponding paths in Admin Settings after mount.
