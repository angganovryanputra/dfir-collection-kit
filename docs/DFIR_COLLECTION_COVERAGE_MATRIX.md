# DFIR Collection Coverage Matrix

**Date:** 2026-06-10 · Source of truth: `backend/app/core/modules.py` (`MODULE_REGISTRY`, 131 modules) ↔ `agent/internal/modules/` (verified in sync 131/131).

Column legend — **Collected**: agent module exists · **Parsed**: pipeline normalizes it (EZTools-style parsers / timeline builders) · **Searchable**: contributes rows to the DuckDB super timeline / hunt queries · **Reportable**: surfaces in analytics, Sigma/YARA/IOC views, or PDF report.

> Parsed/Searchable status reflects the current parser set: EVTX-family logs, Prefetch, Amcache, ShimCache, LNK, JumpLists, MFT/UsnJrnl, and registry execution artifacts feed the timeline; raw-copy artifacts (e.g. browser DBs, plists) are collected and hash-verified but examined manually unless noted.

## Windows (67 modules)

| Artifact family | Module(s) | Collected | Parsed | Searchable | Reportable |
|---|---|---|---|---|---|
| Processes / tree | `windows_process_list`, `windows_process_tree` | ✅ | ✅ (text) | 🟡 | ✅ |
| Network (conns/ports/ifaces/shares) | `windows_network_connections`, `windows_active_connections`, `windows_listening_ports`, `windows_network_interfaces`, `windows_network_shares` | ✅ | ✅ (text) | 🟡 | ✅ |
| DNS cache | `windows_dns_cache` | ✅ | ✅ | 🟡 | ✅ |
| Logged-on users / local users | `windows_logged_on_users`, `windows_local_users` | ✅ | ✅ | 🟡 | ✅ |
| Security/System/App event logs | `windows_eventlog_security`, `_system`, `_application` | ✅ | ✅ | ✅ | ✅ (Sigma) |
| PowerShell (Operational + ScriptBlock) | `windows_eventlog_powershell_operational`, `_ps_scriptblock`, `windows_powershell_history` | ✅ | ✅ | ✅ | ✅ |
| Sysmon | `windows_eventlog_sysmon_operational` | ✅ | ✅ | ✅ | ✅ |
| Task Scheduler / WMI / BITS logs | `windows_eventlog_task_scheduler`, `_wmi_activity`, `_bits`, `windows_bits_jobs` | ✅ | ✅ | ✅ | ✅ |
| Defender (events + exclusions) | `windows_defender_events`, `windows_defender_exclusions` | ✅ | ✅ | ✅ | ✅ |
| Run keys / services / scheduled tasks | `windows_registry_run_keys`, `windows_services`, `windows_scheduled_tasks`, `_xml` | ✅ | ✅ | ✅ | ✅ |
| WMI subscriptions / repository | `windows_wmi_event_subscriptions`, `windows_wmi_repository` | ✅ | 🟡 | 🟡 | ✅ |
| Startup folders / IFEO | `windows_startup_folders`, `windows_ifeo` | ✅ | ✅ | 🟡 | ✅ |
| Prefetch | `windows_prefetch` | ✅ | ✅ | ✅ | ✅ |
| Amcache / ShimCache / AppCompat | `windows_amcache`, `windows_shimcache`, `windows_appcompat_shims` | ✅ | ✅ | ✅ | ✅ |
| SRUM | `windows_srum` | ✅ | ✅ | ✅ | ✅ |
| UserAssist / MRU / Typed URLs / Timeline | `windows_user_assist`, `windows_mru`, `windows_typed_urls`, `windows_timeline` | ✅ | ✅ | ✅ | ✅ |
| $MFT / $UsnJrnl (via VSS) | `windows_mft_vss`, `windows_usnjrnl_vss`, `windows_vss_enumerate` | ✅ | ✅ | ✅ | ✅ |
| Recycle Bin / LNK / Jump Lists / ShellBags / ThumbCache | `windows_recycle_bin`, `windows_lnk_files`, `windows_jump_lists`, `windows_shellbags`, `windows_thumbcache` | ✅ | ✅ | ✅ | ✅ |
| Browser (Chrome/Edge/Firefox) | `windows_browser_chrome`, `_edge`, `_firefox` | ✅ | ⛔ raw copy | ⛔ | 🟡 manual |
| RDP / lateral movement | `windows_rdp_history`, `windows_netlogon_log` + logon events | ✅ | ✅ | ✅ | ✅ (lateral-movement map) |
| Registry hives / NTUSER.DAT / NTDS | `windows_registry_hives`, `windows_ntuser_dat`, `windows_ntds` | ✅ | 🟡 selective | 🟡 | ✅ |
| USB history | `windows_usb_history` | ✅ | ✅ | ✅ | ✅ |
| Firewall (rules + logs) / hosts | `windows_firewall_rules`, `_logs`, `windows_hosts_file` | ✅ | ✅ | 🟡 | ✅ |
| System info / patches / software / env / tz / boot | `windows_system_info`, `windows_installed_patches`, `_software`, `windows_env_vars`, `windows_timezone`, `windows_boot_time` | ✅ | ✅ | — | ✅ |
| Memory image | `windows_memory_acquisition` (WinPmem) | ✅ | ⛔ (external Volatility) | ⛔ | 🟡 |
| **Not collected (gaps)** | Clipboard, handles, BAM/DAM keys (partial via hives), Office add-ins, COM hijack scan, cookies, EDR/AV third-party traces | ⛔ | — | — | P2/P3 backlog |

## Linux (47 modules)

| Artifact family | Module(s) | Collected | Parsed | Searchable | Reportable |
|---|---|---|---|---|---|
| Processes / sockets / lsof | `linux_process_list`, `linux_network_connections`, `linux_proc_net`, `linux_lsof` | ✅ | ✅ (text) | 🟡 | ✅ |
| Users / sessions | `linux_logged_in_users`, `linux_passwd_groups`, `linux_shadow`, `linux_lastlog`, `linux_wtmp`, `linux_btmp` | ✅ | ✅ | ✅ | ✅ |
| Shell history | `linux_bash_history`, `linux_zsh_history`, `linux_user_shell_configs` | ✅ | ✅ | ✅ | ✅ |
| Auth/audit/syslog/journal/dmesg | `linux_auth_logs`, `linux_audit_log`, `linux_syslog`, `linux_journalctl`, `linux_dmesg` | ✅ | ✅ | ✅ | ✅ (Sigma) |
| Cron / at / systemd timers | `linux_cron`, `linux_user_crontabs`, `linux_at_jobs`, `linux_systemd_timers` | ✅ | ✅ | ✅ | ✅ |
| Systemd units/overrides, init, rc.local, profile.d | `linux_systemd_units`, `_overrides`, `linux_init_scripts`, `linux_rc_local`, `linux_profile_d` | ✅ | ✅ | 🟡 | ✅ |
| SSH (keys, authorized_keys, sshd_config) | `linux_ssh_keys`, `linux_authorized_keys`, `linux_sshd_config` | ✅ | ✅ | 🟡 | ✅ |
| Packages / history | `linux_installed_packages`, `linux_package_history` | ✅ | ✅ | 🟡 | ✅ |
| Kernel modules / sysctl / version | `linux_lsmod`, `linux_sysctl`, `linux_kernel_version` | ✅ | ✅ | — | ✅ |
| Privilege config (sudoers, PAM, setuid, ld.preload) | `linux_sudoers`, `linux_pam_config`, `linux_setuid_binaries`, `linux_ld_preload` | ✅ | ✅ | 🟡 | ✅ |
| Network config (ip, iptables, resolv, hosts) | `linux_ip_config`, `linux_iptables_rules`, `linux_resolv_conf`, `linux_hosts`, `linux_network_config` | ✅ | ✅ | — | ✅ |
| Containers | `linux_containers` | ✅ | 🟡 | 🟡 | ✅ |
| Memory image | `linux_memory_acquisition` (AVML/kcore) | ✅ | ⛔ external | ⛔ | 🟡 |
| Environment / misc | `linux_environment` | ✅ | ✅ | — | ✅ |
| **Not collected (gaps)** | Web-server access logs (apache/nginx), eBPF state, K8s artifacts | ⛔ | — | — | P2 backlog |

## macOS (17 modules)

| Artifact family | Module(s) | Collected | Parsed | Searchable | Reportable |
|---|---|---|---|---|---|
| Unified log | `macos_unified_log` | ✅ | ✅ | ✅ | ✅ |
| LaunchAgents / LaunchDaemons / login items / cron | `macos_launchd_agents`, `_daemons`, `macos_login_items`, `macos_cron` | ✅ | ✅ | 🟡 | ✅ |
| Quarantine events | `macos_quarantine_events` | ✅ | ✅ | ✅ | ✅ |
| Shell history | `macos_bash_history`, `macos_zsh_history` | ✅ | ✅ | ✅ | ✅ |
| Browser (Safari/Chrome) | `macos_safari_history`, `macos_chrome_history` | ✅ | ⛔ raw copy | ⛔ | 🟡 manual |
| Processes / network | `macos_process_list`, `macos_network_connections` | ✅ | ✅ (text) | 🟡 | ✅ |
| System info / users / apps / install log | `macos_system_info`, `macos_users`, `macos_installed_apps`, `macos_install_log` | ✅ | ✅ | — | ✅ |
| SSH known hosts | `macos_ssh_known_hosts` | ✅ | ✅ | — | ✅ |
| **Not collected (gaps)** | TCC.db, FSEvents, Spotlight, KnowledgeC, plist persistence sweep beyond launchd, memory acquisition, MRT/XProtect state | ⛔ | — | — | P2 backlog (TCC + FSEvents highest value) |

TCC note: macOS modules downgrade TCC/Full-Disk-Access denials to warnings so one protected artifact never fails a job.

## Coverage Summary vs Benchmarks

| Benchmark | Verdict |
|---|---|
| KAPE artifact completeness (Windows) | ~85 % of common triage targets; browser parsing and BAM/DAM/Office-addins are the main deltas |
| Velociraptor endpoint visibility | Strong one-shot collection; lacks continuous monitoring/VQL-style live queries (live-command feature is the seed for this) |
| Hayabusa/Chainsaw detection | Comparable: Sigma over EVTX with severity rollups |
| Timesketch exploration | Comparable single-instance: DuckDB timeline + filters + saved hunt queries + cross-incident correlation |
