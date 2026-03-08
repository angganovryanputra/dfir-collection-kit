MODULE_REGISTRY = {
    # ── Windows · Volatile ──────────────────────────────────────────────────
    "windows_process_list": {
        "os": "windows",
        "category": "volatile",
        "priority": 1,
        "output_relpath": "volatile/windows/process_list.csv",
        "params": {},
    },
    "windows_network_connections": {
        "os": "windows",
        "category": "volatile",
        "priority": 1,
        "output_relpath": "volatile/windows/network_connections.csv",
        "params": {},
    },
    "windows_listening_ports": {
        "os": "windows",
        "category": "volatile",
        "priority": 1,
        "output_relpath": "volatile/windows/listening_ports.csv",
        "params": {},
    },
    "windows_dns_cache": {
        "os": "windows",
        "category": "volatile",
        "priority": 1,
        "output_relpath": "volatile/windows/dns_cache.txt",
        "params": {},
    },
    # ── Windows · Logs ──────────────────────────────────────────────────────
    "windows_eventlog_security": {
        "os": "windows",
        "category": "logs",
        "priority": 2,
        "output_relpath": "logs/windows/security.evtx",
        "params": {"time_window": "7d"},
    },
    "windows_eventlog_system": {
        "os": "windows",
        "category": "logs",
        "priority": 2,
        "output_relpath": "logs/windows/system.evtx",
        "params": {"time_window": "7d"},
    },
    "windows_eventlog_application": {
        "os": "windows",
        "category": "logs",
        "priority": 2,
        "output_relpath": "logs/windows/application.evtx",
        "params": {"time_window": "7d"},
    },
    "windows_eventlog_powershell_operational": {
        "os": "windows",
        "category": "logs",
        "priority": 2,
        "output_relpath": "logs/windows/powershell_operational.evtx",
        "params": {"time_window": "7d"},
    },
    "windows_eventlog_sysmon_operational": {
        "os": "windows",
        "category": "logs",
        "priority": 2,
        "output_relpath": "logs/windows/sysmon_operational.evtx",
        "params": {"time_window": "7d"},
    },
    # ── Windows · Persistence ───────────────────────────────────────────────
    "windows_scheduled_tasks": {
        "os": "windows",
        "category": "persistence",
        "priority": 3,
        "output_relpath": "persistence/windows/scheduled_tasks.txt",
        "params": {},
    },
    "windows_services": {
        "os": "windows",
        "category": "persistence",
        "priority": 3,
        "output_relpath": "persistence/windows/services.csv",
        "params": {},
    },
    "windows_registry_run_keys": {
        "os": "windows",
        "category": "persistence",
        "priority": 3,
        "output_relpath": "persistence/windows/run_keys.txt",
        "params": {},
    },
    "windows_startup_folders": {
        "os": "windows",
        "category": "persistence",
        "priority": 3,
        "output_relpath": "persistence/windows/startup_folders.txt",
        "params": {},
    },
    "windows_wmi_event_subscriptions": {
        "os": "windows",
        "category": "persistence",
        "priority": 3,
        "output_relpath": "persistence/windows/wmi_event_subscriptions.txt",
        "params": {},
    },
    # ── Windows · System ────────────────────────────────────────────────────
    "windows_local_users": {
        "os": "windows",
        "category": "system",
        "priority": 4,
        "output_relpath": "system/windows/local_users.csv",
        "params": {},
    },
    "windows_logged_on_users": {
        "os": "windows",
        "category": "system",
        "priority": 4,
        "output_relpath": "system/windows/logged_on_users.txt",
        "params": {},
    },
    "windows_system_info": {
        "os": "windows",
        "category": "system",
        "priority": 4,
        "output_relpath": "system/windows/system_info.txt",
        "params": {},
    },
    "windows_installed_patches": {
        "os": "windows",
        "category": "system",
        "priority": 4,
        "output_relpath": "system/windows/installed_patches.csv",
        "params": {},
    },
    "windows_timezone": {
        "os": "windows",
        "category": "system",
        "priority": 4,
        "output_relpath": "system/windows/timezone.txt",
        "params": {},
    },
    "windows_boot_time": {
        "os": "windows",
        "category": "system",
        "priority": 4,
        "output_relpath": "system/windows/boot_time.txt",
        "params": {},
    },
    # ── Linux · Volatile ────────────────────────────────────────────────────
    "linux_process_list": {
        "os": "linux",
        "category": "volatile",
        "priority": 1,
        "output_relpath": "volatile/linux/process_list.txt",
        "params": {},
    },
    "linux_network_connections": {
        "os": "linux",
        "category": "volatile",
        "priority": 1,
        "output_relpath": "volatile/linux/network_connections.txt",
        "params": {},
    },
    # ── Linux · Logs ────────────────────────────────────────────────────────
    "linux_journalctl": {
        "os": "linux",
        "category": "logs",
        "priority": 2,
        "output_relpath": "logs/linux/journalctl.log",
        "params": {"time_window": "7d"},
    },
    "linux_syslog": {
        "os": "linux",
        "category": "logs",
        "priority": 2,
        "output_relpath": "logs/linux/syslog.log",
        "params": {},
    },
    "linux_auth_logs": {
        "os": "linux",
        "category": "logs",
        "priority": 2,
        "output_relpath": "logs/linux/auth.log",
        "params": {},
    },
    "linux_wtmp": {
        "os": "linux",
        "category": "logs",
        "priority": 2,
        "output_relpath": "logs/linux/wtmp.txt",
        "params": {},
    },
    "linux_btmp": {
        "os": "linux",
        "category": "logs",
        "priority": 2,
        "output_relpath": "logs/linux/btmp.txt",
        "params": {},
    },
    # ── Linux · Persistence ─────────────────────────────────────────────────
    "linux_cron": {
        "os": "linux",
        "category": "persistence",
        "priority": 3,
        "output_relpath": "persistence/linux/cron.txt",
        "params": {},
    },
    "linux_systemd_units": {
        "os": "linux",
        "category": "persistence",
        "priority": 3,
        "output_relpath": "persistence/linux/systemd_units.txt",
        "params": {},
    },
    "linux_systemd_timers": {
        "os": "linux",
        "category": "persistence",
        "priority": 3,
        "output_relpath": "persistence/linux/systemd_timers.txt",
        "params": {},
    },
    "linux_rc_local": {
        "os": "linux",
        "category": "persistence",
        "priority": 3,
        "output_relpath": "persistence/linux/rc_local.txt",
        "params": {},
    },
    "linux_authorized_keys": {
        "os": "linux",
        "category": "persistence",
        "priority": 3,
        "output_relpath": "persistence/linux/authorized_keys.txt",
        "params": {},
    },
    # ── Windows · Artifacts (KAPE-like file collection) ─────────────────────
    "windows_registry_hives": {
        "os": "windows",
        "category": "artifacts",
        "priority": 2,
        "output_relpath": "artifacts/windows/registry/",
        "params": {},
    },
    "windows_ntuser_dat": {
        "os": "windows",
        "category": "artifacts",
        "priority": 2,
        "output_relpath": "artifacts/windows/registry/users/",
        "params": {},
    },
    "windows_prefetch": {
        "os": "windows",
        "category": "artifacts",
        "priority": 2,
        "output_relpath": "artifacts/windows/prefetch/",
        "params": {},
    },
    "windows_amcache": {
        "os": "windows",
        "category": "artifacts",
        "priority": 2,
        "output_relpath": "artifacts/windows/amcache/",
        "params": {},
    },
    "windows_shimcache": {
        "os": "windows",
        "category": "artifacts",
        "priority": 2,
        "output_relpath": "artifacts/windows/shimcache.txt",
        "params": {},
    },
    "windows_lnk_files": {
        "os": "windows",
        "category": "artifacts",
        "priority": 3,
        "output_relpath": "artifacts/windows/lnk/",
        "params": {},
    },
    "windows_jump_lists": {
        "os": "windows",
        "category": "artifacts",
        "priority": 3,
        "output_relpath": "artifacts/windows/jumplists/",
        "params": {},
    },
    "windows_browser_chrome": {
        "os": "windows",
        "category": "artifacts",
        "priority": 3,
        "output_relpath": "artifacts/windows/browser/chrome/",
        "params": {},
    },
    "windows_browser_edge": {
        "os": "windows",
        "category": "artifacts",
        "priority": 3,
        "output_relpath": "artifacts/windows/browser/edge/",
        "params": {},
    },
    "windows_bits_jobs": {
        "os": "windows",
        "category": "artifacts",
        "priority": 3,
        "output_relpath": "artifacts/windows/bits_jobs.csv",
        "params": {},
    },
    "windows_recycle_bin": {
        "os": "windows",
        "category": "artifacts",
        "priority": 4,
        "output_relpath": "artifacts/windows/recycle_bin.txt",
        "params": {},
    },
    "windows_thumbcache": {
        "os": "windows",
        "category": "artifacts",
        "priority": 4,
        "output_relpath": "artifacts/windows/thumbcache/",
        "params": {},
    },
    "windows_shellbags": {
        "os": "windows",
        "category": "artifacts",
        "priority": 3,
        "output_relpath": "artifacts/windows/shellbags.txt",
        "params": {},
    },
    "windows_mru": {
        "os": "windows",
        "category": "artifacts",
        "priority": 3,
        "output_relpath": "artifacts/windows/mru.txt",
        "params": {},
    },
    "windows_usb_history": {
        "os": "windows",
        "category": "artifacts",
        "priority": 3,
        "output_relpath": "artifacts/windows/usb_history.txt",
        "params": {},
    },
    "windows_mft_vss": {
        "os": "windows",
        "category": "artifacts",
        "priority": 1,
        "output_relpath": "artifacts/windows/ntfs/MFT",
        "params": {},
    },
    "windows_usnjrnl_vss": {
        "os": "windows",
        "category": "artifacts",
        "priority": 1,
        "output_relpath": "artifacts/windows/ntfs/UsnJrnl_$J",
        "params": {},
    },
    # ── Linux · System ──────────────────────────────────────────────────────
    "linux_ip_config": {
        "os": "linux",
        "category": "system",
        "priority": 4,
        "output_relpath": "system/linux/ip_config.txt",
        "params": {},
    },
    "linux_resolv_conf": {
        "os": "linux",
        "category": "system",
        "priority": 4,
        "output_relpath": "system/linux/resolv.conf",
        "params": {},
    },
    "linux_bash_history": {
        "os": "linux",
        "category": "system",
        "priority": 4,
        "output_relpath": "system/linux/bash_history.txt",
        "params": {},
    },
    "linux_logged_in_users": {
        "os": "linux",
        "category": "system",
        "priority": 4,
        "output_relpath": "system/linux/logged_in_users.txt",
        "params": {},
    },
    "linux_installed_packages": {
        "os": "linux",
        "category": "system",
        "priority": 4,
        "output_relpath": "system/linux/installed_packages.txt",
        "params": {},
    },
    "linux_kernel_version": {
        "os": "linux",
        "category": "system",
        "priority": 4,
        "output_relpath": "system/linux/kernel_version.txt",
        "params": {},
    },
    # ── macOS · Volatile ─────────────────────────────────────────────────────
    "macos_process_list": {
        "os": "macos",
        "category": "volatile",
        "priority": 1,
        "output_relpath": "volatile/macos/process_list.txt",
        "params": {},
    },
    "macos_network_connections": {
        "os": "macos",
        "category": "volatile",
        "priority": 1,
        "output_relpath": "volatile/macos/network_connections.txt",
        "params": {},
    },
    # ── macOS · Logs ─────────────────────────────────────────────────────────
    "macos_unified_log": {
        "os": "macos",
        "category": "logs",
        "priority": 2,
        "output_relpath": "logs/macos/unified_log.txt",
        "params": {"time_window": "7d"},
    },
    "macos_install_log": {
        "os": "macos",
        "category": "logs",
        "priority": 2,
        "output_relpath": "logs/macos/install.log",
        "params": {},
    },
    # ── macOS · Persistence ──────────────────────────────────────────────────
    "macos_launchd_agents": {
        "os": "macos",
        "category": "persistence",
        "priority": 3,
        "output_relpath": "persistence/macos/launchd_agents.txt",
        "params": {},
    },
    "macos_launchd_daemons": {
        "os": "macos",
        "category": "persistence",
        "priority": 3,
        "output_relpath": "persistence/macos/launchd_daemons.txt",
        "params": {},
    },
    "macos_login_items": {
        "os": "macos",
        "category": "persistence",
        "priority": 3,
        "output_relpath": "persistence/macos/login_items.txt",
        "params": {},
    },
    "macos_cron": {
        "os": "macos",
        "category": "persistence",
        "priority": 3,
        "output_relpath": "persistence/macos/cron.txt",
        "params": {},
    },
    # ── macOS · System ───────────────────────────────────────────────────────
    "macos_system_info": {
        "os": "macos",
        "category": "system",
        "priority": 4,
        "output_relpath": "system/macos/system_info.txt",
        "params": {},
    },
    "macos_users": {
        "os": "macos",
        "category": "system",
        "priority": 4,
        "output_relpath": "system/macos/users.txt",
        "params": {},
    },
    "macos_bash_history": {
        "os": "macos",
        "category": "system",
        "priority": 4,
        "output_relpath": "system/macos/bash_history.txt",
        "params": {},
    },
    "macos_zsh_history": {
        "os": "macos",
        "category": "system",
        "priority": 4,
        "output_relpath": "system/macos/zsh_history.txt",
        "params": {},
    },
    "macos_installed_apps": {
        "os": "macos",
        "category": "system",
        "priority": 4,
        "output_relpath": "system/macos/installed_apps.txt",
        "params": {},
    },
    # ── macOS · Artifacts ────────────────────────────────────────────────────
    "macos_safari_history": {
        "os": "macos",
        "category": "artifacts",
        "priority": 3,
        "output_relpath": "artifacts/macos/safari/History.db",
        "params": {},
    },
    "macos_chrome_history": {
        "os": "macos",
        "category": "artifacts",
        "priority": 3,
        "output_relpath": "artifacts/macos/chrome/",
        "params": {},
    },
    "macos_quarantine_events": {
        "os": "macos",
        "category": "artifacts",
        "priority": 2,
        "output_relpath": "artifacts/macos/quarantine_events.db",
        "params": {},
    },
    "macos_ssh_known_hosts": {
        "os": "macos",
        "category": "artifacts",
        "priority": 3,
        "output_relpath": "artifacts/macos/ssh_known_hosts.txt",
        "params": {},
    },
}

SUPPORTED_OS = {"windows", "linux", "macos"}

# ── Collection Profiles (KAPE-style compound targets) ──────────────────────
# Each profile lists module IDs covering a specific investigation scenario.
COLLECTION_PROFILES: dict[str, dict] = {
    "triage": {
        "label": "Rapid Triage",
        "description": "Fast first-response collection: volatile data, key logs, persistence, and critical execution artifacts.",
        "modules": {
            "windows": [
                # Volatile — collect first
                "windows_process_list",
                "windows_network_connections",
                "windows_listening_ports",
                "windows_dns_cache",
                # Logs
                "windows_eventlog_security",
                "windows_eventlog_system",
                "windows_eventlog_powershell_operational",
                # Persistence
                "windows_scheduled_tasks",
                "windows_registry_run_keys",
                "windows_services",
                # System
                "windows_local_users",
                "windows_logged_on_users",
                # Key execution artifacts
                "windows_prefetch",
                "windows_shimcache",
                "windows_registry_hives",
            ],
            "linux": [
                "linux_process_list",
                "linux_network_connections",
                "linux_auth_logs",
                "linux_journalctl",
                "linux_cron",
                "linux_authorized_keys",
                "linux_logged_in_users",
            ],
            "macos": [
                "macos_process_list",
                "macos_network_connections",
                "macos_unified_log",
                "macos_launchd_agents",
                "macos_launchd_daemons",
                "macos_login_items",
                "macos_users",
                "macos_quarantine_events",
            ],
        },
    },
    "ransomware": {
        "label": "Ransomware Response",
        "description": "Targeted collection for ransomware: execution artifacts, lateral movement, persistence, and data staging evidence.",
        "modules": {
            "windows": [
                # Volatile
                "windows_process_list",
                "windows_network_connections",
                # Logs — full set for lateral movement analysis
                "windows_eventlog_security",
                "windows_eventlog_system",
                "windows_eventlog_application",
                "windows_eventlog_powershell_operational",
                "windows_eventlog_sysmon_operational",
                # Persistence
                "windows_scheduled_tasks",
                "windows_registry_run_keys",
                "windows_services",
                "windows_wmi_event_subscriptions",
                "windows_startup_folders",
                # Execution artifacts
                "windows_prefetch",
                "windows_amcache",
                "windows_shimcache",
                # Registry hives for deeper analysis
                "windows_registry_hives",
                "windows_ntuser_dat",
                # Data staging / exfil evidence
                "windows_recycle_bin",
                "windows_bits_jobs",
                "windows_usb_history",
                # NTFS metadata — critical for file deletion/encryption timeline
                "windows_mft_vss",
                "windows_usnjrnl_vss",
                # System
                "windows_local_users",
                "windows_system_info",
            ],
            "linux": [
                "linux_process_list",
                "linux_network_connections",
                "linux_auth_logs",
                "linux_journalctl",
                "linux_syslog",
                "linux_cron",
                "linux_systemd_units",
                "linux_authorized_keys",
                "linux_bash_history",
            ],
            "macos": [
                "macos_process_list",
                "macos_network_connections",
                "macos_unified_log",
                "macos_install_log",
                "macos_launchd_agents",
                "macos_launchd_daemons",
                "macos_login_items",
                "macos_cron",
                "macos_bash_history",
                "macos_zsh_history",
                "macos_quarantine_events",
                "macos_system_info",
            ],
        },
    },
    "insider_threat": {
        "label": "Insider Threat",
        "description": "User activity, data access patterns, browser history, USB usage, and file access artifacts.",
        "modules": {
            "windows": [
                # User activity artifacts
                "windows_lnk_files",
                "windows_jump_lists",
                "windows_shellbags",
                "windows_mru",
                "windows_thumbcache",
                # Browser evidence
                "windows_browser_chrome",
                "windows_browser_edge",
                # Data exfiltration indicators
                "windows_usb_history",
                "windows_bits_jobs",
                "windows_recycle_bin",
                # User registry hives
                "windows_ntuser_dat",
                # Execution history
                "windows_prefetch",
                "windows_shimcache",
                # NTFS metadata — full file access timeline
                "windows_mft_vss",
                "windows_usnjrnl_vss",
                # Logs for user activity
                "windows_eventlog_security",
                "windows_eventlog_powershell_operational",
                # Volatile
                "windows_process_list",
                "windows_network_connections",
                "windows_logged_on_users",
            ],
            "linux": [
                "linux_bash_history",
                "linux_auth_logs",
                "linux_authorized_keys",
                "linux_process_list",
                "linux_network_connections",
                "linux_journalctl",
            ],
            "macos": [
                "macos_bash_history",
                "macos_zsh_history",
                "macos_safari_history",
                "macos_chrome_history",
                "macos_quarantine_events",
                "macos_ssh_known_hosts",
                "macos_process_list",
                "macos_network_connections",
                "macos_unified_log",
            ],
        },
    },
    "full": {
        "label": "Full Collection",
        "description": "Comprehensive collection of all available artefacts.",
        "modules": {
            "windows": [k for k, v in MODULE_REGISTRY.items() if v["os"] == "windows"],
            "linux": [k for k, v in MODULE_REGISTRY.items() if v["os"] == "linux"],
            "macos": [k for k, v in MODULE_REGISTRY.items() if v["os"] == "macos"],
        },
    },
}


_MACOS_ALIASES = {"darwin", "macos", "mac os x", "mac os", "osx", "mac"}


def normalize_os_name(os_name: str | None) -> str | None:
    if not os_name:
        return None
    name = os_name.split("/")[0].lower().strip()
    if name in _MACOS_ALIASES:
        return "macos"
    return name


def validate_modules_for_os(module_ids: list[str], os_name: str | None) -> None:
    normalized_os = normalize_os_name(os_name)
    if normalized_os and normalized_os not in SUPPORTED_OS:
        raise ValueError(f"Unsupported OS: {os_name}")
    if not normalized_os:
        return
    for module_id in module_ids:
        entry = MODULE_REGISTRY.get(module_id)
        if not entry:
            raise ValueError(f"Unknown module_id: {module_id}")
        if entry["os"] != normalized_os:
            raise ValueError(f"Module {module_id} not supported on {normalized_os}")


def build_modules(module_ids: list[str] | None = None, os_name: str | None = None) -> list[dict]:
    normalized_os = normalize_os_name(os_name)
    if not module_ids:
        if not normalized_os:
            raise ValueError("module_ids or os_name is required")
        if normalized_os not in SUPPORTED_OS:
            raise ValueError(f"Unsupported OS: {os_name}")
        module_ids = [
            module_id
            for module_id, entry in MODULE_REGISTRY.items()
            if entry["os"] == normalized_os
        ]
    else:
        validate_modules_for_os(module_ids, os_name)
    modules: list[dict] = []
    for module_id in module_ids:
        if module_id not in MODULE_REGISTRY:
            raise ValueError(f"Unknown module_id: {module_id}")
        entry = MODULE_REGISTRY[module_id]
        modules.append(
            {
                "module_id": module_id,
                "output_relpath": entry["output_relpath"],
                "params": entry["params"],
            }
        )
    return modules


def get_modules_by_category(os_name: str | None = None) -> dict[str, list[dict]]:
    """Return MODULE_REGISTRY entries grouped by category, optionally filtered by OS."""
    normalized_os = normalize_os_name(os_name)
    result: dict[str, list[dict]] = {}
    for module_id, entry in MODULE_REGISTRY.items():
        if normalized_os and entry["os"] != normalized_os:
            continue
        cat = entry["category"]
        if cat not in result:
            result[cat] = []
        result[cat].append(
            {
                "id": module_id,
                "os": entry["os"],
                "category": entry["category"],
                "priority": entry["priority"],
                "output_relpath": entry["output_relpath"],
            }
        )
    # Sort each category by priority then module_id for stable ordering
    for cat in result:
        result[cat].sort(key=lambda m: (m["priority"], m["id"]))
    return result


def get_profile_modules(profile_id: str, os_name: str) -> list[str]:
    """Return module IDs for a named profile and OS."""
    profile = COLLECTION_PROFILES.get(profile_id)
    if not profile:
        raise ValueError(f"Unknown profile: {profile_id}")
    normalized_os = normalize_os_name(os_name)
    if not normalized_os or normalized_os not in SUPPORTED_OS:
        raise ValueError(f"Unsupported OS: {os_name}")
    return profile["modules"].get(normalized_os, [])
