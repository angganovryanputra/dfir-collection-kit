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
    "windows_memory_acquisition": {
        "os": "windows",
        "category": "volatile",
        "priority": 0,  # highest priority — acquire while processes are live
        "output_relpath": "volatile/windows/memory.raw",
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
    "linux_memory_acquisition": {
        "os": "linux",
        "category": "volatile",
        "priority": 0,  # highest priority — acquire while processes are live
        "output_relpath": "volatile/linux/memory.raw",
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
    "windows_vss_enumerate": {
        "os": "windows",
        "category": "artifacts",
        "priority": 2,
        "output_relpath": "artifacts/windows/vss/shadow_copies.txt",
        "params": {},
    },
    "windows_usnjrnl_vss": {
        "os": "windows",
        "category": "artifacts",
        "priority": 1,
        "output_relpath": "artifacts/windows/ntfs/UsnJrnl_$J",
        "params": {},
    },
    # ── Windows · Additional Artifacts ─────────────────────────────────────
    "windows_powershell_history": {
        "os": "windows",
        "category": "artifacts",
        "priority": 2,
        "output_relpath": "artifacts/windows/powershell_history/",
        "params": {},
    },
    "windows_user_assist": {
        "os": "windows",
        "category": "artifacts",
        "priority": 2,
        "output_relpath": "artifacts/windows/user_assist.csv",
        "params": {},
    },
    "windows_rdp_history": {
        "os": "windows",
        "category": "artifacts",
        "priority": 3,
        "output_relpath": "artifacts/windows/rdp_history.txt",
        "params": {},
    },
    "windows_defender_events": {
        "os": "windows",
        "category": "logs",
        "priority": 2,
        "output_relpath": "logs/windows/defender/",
        "params": {"time_window": "7d"},
    },
    "windows_srum": {
        "os": "windows",
        "category": "artifacts",
        "priority": 1,
        "output_relpath": "artifacts/windows/srum/",
        "params": {},
    },
    "windows_scheduled_tasks_xml": {
        "os": "windows",
        "category": "persistence",
        "priority": 2,
        "output_relpath": "artifacts/windows/tasks_xml/",
        "params": {},
    },
    "windows_firewall_rules": {
        "os": "windows",
        "category": "system",
        "priority": 3,
        "output_relpath": "artifacts/windows/firewall_rules.csv",
        "params": {},
    },
    "windows_firewall_logs": {
        "os": "windows",
        "category": "logs",
        "priority": 3,
        "output_relpath": "artifacts/windows/firewall_logs/",
        "params": {},
    },
    "windows_env_vars": {
        "os": "windows",
        "category": "system",
        "priority": 4,
        "output_relpath": "system/windows/env_vars.csv",
        "params": {},
    },
    "windows_browser_firefox": {
        "os": "windows",
        "category": "artifacts",
        "priority": 3,
        "output_relpath": "artifacts/windows/browser/firefox/",
        "params": {},
    },
    "windows_wmi_repository": {
        "os": "windows",
        "category": "artifacts",
        "priority": 2,
        "output_relpath": "artifacts/windows/wmi_repository/",
        "params": {},
    },
    "windows_eventlog_task_scheduler": {
        "os": "windows",
        "category": "logs",
        "priority": 2,
        "output_relpath": "logs/windows/task_scheduler.evtx",
        "params": {"time_window": "7d"},
    },
    "windows_typed_urls": {
        "os": "windows",
        "category": "artifacts",
        "priority": 4,
        "output_relpath": "artifacts/windows/typed_urls.txt",
        "params": {},
    },
    "windows_network_shares": {
        "os": "windows",
        "category": "system",
        "priority": 3,
        "output_relpath": "system/windows/network_shares.csv",
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
    # ── Linux · Additional Artifacts ────────────────────────────────────────
    "linux_shadow": {
        "os": "linux",
        "category": "system",
        "priority": 2,
        "output_relpath": "system/linux/shadow.txt",
        "params": {},
    },
    "linux_passwd_groups": {
        "os": "linux",
        "category": "system",
        "priority": 3,
        "output_relpath": "system/linux/passwd_groups.txt",
        "params": {},
    },
    "linux_sudoers": {
        "os": "linux",
        "category": "persistence",
        "priority": 2,
        "output_relpath": "system/linux/sudoers.txt",
        "params": {},
    },
    "linux_hosts": {
        "os": "linux",
        "category": "system",
        "priority": 4,
        "output_relpath": "system/linux/hosts.txt",
        "params": {},
    },
    "linux_sysctl": {
        "os": "linux",
        "category": "system",
        "priority": 4,
        "output_relpath": "system/linux/sysctl.txt",
        "params": {},
    },
    "linux_audit_log": {
        "os": "linux",
        "category": "logs",
        "priority": 2,
        "output_relpath": "logs/linux/audit.log",
        "params": {},
    },
    "linux_lsof": {
        "os": "linux",
        "category": "volatile",
        "priority": 1,
        "output_relpath": "volatile/linux/lsof.txt",
        "params": {},
    },
    "linux_dmesg": {
        "os": "linux",
        "category": "logs",
        "priority": 3,
        "output_relpath": "logs/linux/dmesg.txt",
        "params": {},
    },
    "linux_lsmod": {
        "os": "linux",
        "category": "system",
        "priority": 3,
        "output_relpath": "system/linux/lsmod.txt",
        "params": {},
    },
    "linux_zsh_history": {
        "os": "linux",
        "category": "system",
        "priority": 4,
        "output_relpath": "system/linux/zsh_history.txt",
        "params": {},
    },
    "linux_sshd_config": {
        "os": "linux",
        "category": "system",
        "priority": 3,
        "output_relpath": "system/linux/sshd_config.txt",
        "params": {},
    },
    "linux_ld_preload": {
        "os": "linux",
        "category": "persistence",
        "priority": 1,
        "output_relpath": "persistence/linux/ld_preload.txt",
        "params": {},
    },
    "linux_environment": {
        "os": "linux",
        "category": "system",
        "priority": 4,
        "output_relpath": "system/linux/environment.txt",
        "params": {},
    },
    "linux_pam_config": {
        "os": "linux",
        "category": "persistence",
        "priority": 2,
        "output_relpath": "persistence/linux/pam_config.txt",
        "params": {},
    },
    "linux_containers": {
        "os": "linux",
        "category": "volatile",
        "priority": 2,
        "output_relpath": "volatile/linux/containers.txt",
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

# Estimated compressed collection size per module in MiB.
# Values are order-of-magnitude guidance for sizing; actual sizes vary.
_MODULE_SIZES: dict[str, float] = {
    # Windows — volatile
    "windows_process_list": 0.2,
    "windows_network_connections": 0.2,
    "windows_listening_ports": 0.1,
    "windows_dns_cache": 0.1,
    "windows_memory_acquisition": 8192.0,
    # Windows — logs
    "windows_eventlog_security": 100.0,
    "windows_eventlog_system": 50.0,
    "windows_eventlog_application": 50.0,
    "windows_eventlog_powershell_operational": 20.0,
    "windows_eventlog_sysmon_operational": 200.0,
    "windows_defender_events": 50.0,
    "windows_firewall_logs": 20.0,
    "windows_eventlog_task_scheduler": 20.0,
    # Windows — persistence
    "windows_scheduled_tasks": 0.5,
    "windows_services": 0.5,
    "windows_registry_run_keys": 0.1,
    "windows_startup_folders": 0.1,
    "windows_wmi_event_subscriptions": 0.5,
    "windows_scheduled_tasks_xml": 1.0,
    # Windows — system
    "windows_local_users": 0.1,
    "windows_logged_on_users": 0.1,
    "windows_system_info": 0.1,
    "windows_installed_patches": 1.0,
    "windows_timezone": 0.1,
    "windows_boot_time": 0.1,
    "windows_firewall_rules": 0.5,
    "windows_env_vars": 0.1,
    "windows_network_shares": 0.1,
    # Windows — artifacts
    "windows_registry_hives": 50.0,
    "windows_ntuser_dat": 20.0,
    "windows_prefetch": 5.0,
    "windows_amcache": 10.0,
    "windows_shimcache": 1.0,
    "windows_lnk_files": 2.0,
    "windows_jump_lists": 2.0,
    "windows_browser_chrome": 50.0,
    "windows_browser_edge": 50.0,
    "windows_browser_firefox": 50.0,
    "windows_bits_jobs": 0.5,
    "windows_recycle_bin": 1.0,
    "windows_thumbcache": 20.0,
    "windows_shellbags": 0.5,
    "windows_mru": 0.5,
    "windows_usb_history": 0.5,
    "windows_mft_vss": 200.0,
    "windows_usnjrnl_vss": 300.0,
    "windows_powershell_history": 0.5,
    "windows_user_assist": 0.5,
    "windows_rdp_history": 0.5,
    "windows_srum": 10.0,
    "windows_wmi_repository": 30.0,
    "windows_typed_urls": 0.1,
    "windows_vss_enumerate": 0.1,
    # Linux — volatile
    "linux_process_list": 0.2,
    "linux_network_connections": 0.2,
    "linux_memory_acquisition": 8192.0,
    "linux_lsof": 0.5,
    "linux_containers": 0.5,
    # Linux — logs
    "linux_journalctl": 50.0,
    "linux_syslog": 30.0,
    "linux_auth_logs": 5.0,
    "linux_wtmp": 0.5,
    "linux_btmp": 0.5,
    "linux_audit_log": 50.0,
    "linux_dmesg": 0.5,
    # Linux — persistence
    "linux_cron": 0.1,
    "linux_systemd_units": 0.5,
    "linux_systemd_timers": 0.1,
    "linux_rc_local": 0.1,
    "linux_authorized_keys": 0.1,
    "linux_sudoers": 0.1,
    "linux_ld_preload": 0.1,
    "linux_pam_config": 0.1,
    # Linux — system
    "linux_ip_config": 0.1,
    "linux_resolv_conf": 0.1,
    "linux_bash_history": 0.2,
    "linux_logged_in_users": 0.1,
    "linux_installed_packages": 1.0,
    "linux_kernel_version": 0.1,
    "linux_shadow": 0.1,
    "linux_passwd_groups": 0.1,
    "linux_hosts": 0.1,
    "linux_sysctl": 0.2,
    "linux_lsmod": 0.2,
    "linux_zsh_history": 0.2,
    "linux_sshd_config": 0.1,
    "linux_environment": 0.1,
    # macOS — volatile
    "macos_process_list": 0.2,
    "macos_network_connections": 0.2,
    # macOS — logs
    "macos_unified_log": 100.0,
    "macos_install_log": 5.0,
    # macOS — persistence
    "macos_launchd_agents": 0.5,
    "macos_launchd_daemons": 0.5,
    "macos_login_items": 0.1,
    "macos_cron": 0.1,
    # macOS — system
    "macos_system_info": 0.2,
    "macos_users": 0.2,
    "macos_bash_history": 0.2,
    "macos_zsh_history": 0.2,
    "macos_installed_apps": 0.5,
    # macOS — artifacts
    "macos_safari_history": 20.0,
    "macos_chrome_history": 30.0,
    "macos_quarantine_events": 2.0,
    "macos_ssh_known_hosts": 0.1,
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
                "linux_lsof",
                "linux_auth_logs",
                "linux_journalctl",
                "linux_cron",
                "linux_authorized_keys",
                "linux_logged_in_users",
                "linux_sudoers",
                "linux_ld_preload",
                "linux_passwd_groups",
                "linux_sshd_config",
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
                # SRUM — proves execution and network activity after log clearing
                "windows_srum",
                # Defender detections
                "windows_defender_events",
                # Task Scheduler — common ransomware persistence
                "windows_eventlog_task_scheduler",
                "windows_scheduled_tasks_xml",
                # System
                "windows_local_users",
                "windows_system_info",
                "windows_network_shares",
            ],
            "linux": [
                "linux_process_list",
                "linux_network_connections",
                "linux_lsof",
                "linux_containers",
                "linux_auth_logs",
                "linux_audit_log",
                "linux_journalctl",
                "linux_syslog",
                "linux_cron",
                "linux_systemd_units",
                "linux_authorized_keys",
                "linux_bash_history",
                "linux_zsh_history",
                "linux_sudoers",
                "linux_ld_preload",
                "linux_pam_config",
                "linux_lsmod",
                "linux_sshd_config",
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
                "windows_user_assist",
                "windows_powershell_history",
                # NTFS metadata — full file access timeline
                "windows_mft_vss",
                "windows_usnjrnl_vss",
                "windows_srum",
                # Logs for user activity
                "windows_eventlog_security",
                "windows_eventlog_powershell_operational",
                "windows_typed_urls",
                "windows_rdp_history",
                # Volatile
                "windows_process_list",
                "windows_network_connections",
                "windows_logged_on_users",
            ],
            "linux": [
                "linux_bash_history",
                "linux_zsh_history",
                "linux_auth_logs",
                "linux_audit_log",
                "linux_authorized_keys",
                "linux_process_list",
                "linux_network_connections",
                "linux_lsof",
                "linux_journalctl",
                "linux_sudoers",
                "linux_passwd_groups",
                "linux_sshd_config",
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
                "estimated_size_mb": _MODULE_SIZES.get(module_id, 1.0),
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
