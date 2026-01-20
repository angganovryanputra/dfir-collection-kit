MODULE_REGISTRY = {
    "windows_eventlog_security": {
        "os": "windows",
        "output_relpath": "logs/windows/security.evtx",
        "params": {"time_window": "7d"},
    },
    "windows_eventlog_system": {
        "os": "windows",
        "output_relpath": "logs/windows/system.evtx",
        "params": {"time_window": "7d"},
    },
    "windows_eventlog_application": {
        "os": "windows",
        "output_relpath": "logs/windows/application.evtx",
        "params": {"time_window": "7d"},
    },
    "windows_eventlog_powershell_operational": {
        "os": "windows",
        "output_relpath": "logs/windows/powershell_operational.evtx",
        "params": {"time_window": "7d"},
    },
    "windows_eventlog_sysmon_operational": {
        "os": "windows",
        "output_relpath": "logs/windows/sysmon_operational.evtx",
        "params": {"time_window": "7d"},
    },
    "windows_process_list": {
        "os": "windows",
        "output_relpath": "volatile/windows/process_list.csv",
        "params": {},
    },
    "windows_network_connections": {
        "os": "windows",
        "output_relpath": "volatile/windows/network_connections.csv",
        "params": {},
    },
    "windows_listening_ports": {
        "os": "windows",
        "output_relpath": "volatile/windows/listening_ports.csv",
        "params": {},
    },
    "windows_dns_cache": {
        "os": "windows",
        "output_relpath": "volatile/windows/dns_cache.txt",
        "params": {},
    },
    "windows_scheduled_tasks": {
        "os": "windows",
        "output_relpath": "persistence/windows/scheduled_tasks.txt",
        "params": {},
    },
    "windows_services": {
        "os": "windows",
        "output_relpath": "persistence/windows/services.csv",
        "params": {},
    },
    "windows_registry_run_keys": {
        "os": "windows",
        "output_relpath": "persistence/windows/run_keys.txt",
        "params": {},
    },
    "windows_startup_folders": {
        "os": "windows",
        "output_relpath": "persistence/windows/startup_folders.txt",
        "params": {},
    },
    "windows_wmi_event_subscriptions": {
        "os": "windows",
        "output_relpath": "persistence/windows/wmi_event_subscriptions.txt",
        "params": {},
    },
    "windows_local_users": {
        "os": "windows",
        "output_relpath": "system/windows/local_users.csv",
        "params": {},
    },
    "windows_logged_on_users": {
        "os": "windows",
        "output_relpath": "system/windows/logged_on_users.txt",
        "params": {},
    },
    "windows_system_info": {
        "os": "windows",
        "output_relpath": "system/windows/system_info.txt",
        "params": {},
    },
    "windows_installed_patches": {
        "os": "windows",
        "output_relpath": "system/windows/installed_patches.csv",
        "params": {},
    },
    "windows_timezone": {
        "os": "windows",
        "output_relpath": "system/windows/timezone.txt",
        "params": {},
    },
    "windows_boot_time": {
        "os": "windows",
        "output_relpath": "system/windows/boot_time.txt",
        "params": {},
    },
    "linux_journalctl": {
        "os": "linux",
        "output_relpath": "logs/linux/journalctl.log",
        "params": {"time_window": "7d"},
    },
    "linux_syslog": {
        "os": "linux",
        "output_relpath": "logs/linux/syslog.log",
        "params": {},
    },
    "linux_auth_logs": {
        "os": "linux",
        "output_relpath": "logs/linux/auth.log",
        "params": {},
    },
    "linux_wtmp": {
        "os": "linux",
        "output_relpath": "logs/linux/wtmp.txt",
        "params": {},
    },
    "linux_btmp": {
        "os": "linux",
        "output_relpath": "logs/linux/btmp.txt",
        "params": {},
    },
    "linux_cron": {
        "os": "linux",
        "output_relpath": "persistence/linux/cron.txt",
        "params": {},
    },
    "linux_systemd_units": {
        "os": "linux",
        "output_relpath": "persistence/linux/systemd_units.txt",
        "params": {},
    },
    "linux_systemd_timers": {
        "os": "linux",
        "output_relpath": "persistence/linux/systemd_timers.txt",
        "params": {},
    },
    "linux_rc_local": {
        "os": "linux",
        "output_relpath": "persistence/linux/rc_local.txt",
        "params": {},
    },
    "linux_authorized_keys": {
        "os": "linux",
        "output_relpath": "persistence/linux/authorized_keys.txt",
        "params": {},
    },
    "linux_process_list": {
        "os": "linux",
        "output_relpath": "volatile/linux/process_list.txt",
        "params": {},
    },
    "linux_network_connections": {
        "os": "linux",
        "output_relpath": "volatile/linux/network_connections.txt",
        "params": {},
    },
    "linux_ip_config": {
        "os": "linux",
        "output_relpath": "system/linux/ip_config.txt",
        "params": {},
    },
    "linux_resolv_conf": {
        "os": "linux",
        "output_relpath": "system/linux/resolv.conf",
        "params": {},
    },
    "linux_bash_history": {
        "os": "linux",
        "output_relpath": "system/linux/bash_history.txt",
        "params": {},
    },
    "linux_logged_in_users": {
        "os": "linux",
        "output_relpath": "system/linux/logged_in_users.txt",
        "params": {},
    },
    "linux_installed_packages": {
        "os": "linux",
        "output_relpath": "system/linux/installed_packages.txt",
        "params": {},
    },
    "linux_kernel_version": {
        "os": "linux",
        "output_relpath": "system/linux/kernel_version.txt",
        "params": {},
    },
}


def normalize_os_name(os_name: str | None) -> str | None:
    if not os_name:
        return None
    return os_name.split("/")[0].lower()


def build_modules(module_ids: list[str] | None = None, os_name: str | None = None) -> list[dict]:
    normalized_os = normalize_os_name(os_name)
    if not module_ids:
        if not normalized_os:
            raise ValueError("module_ids or os_name is required")
        module_ids = [
            module_id
            for module_id, entry in MODULE_REGISTRY.items()
            if entry["os"] == normalized_os
        ]
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
