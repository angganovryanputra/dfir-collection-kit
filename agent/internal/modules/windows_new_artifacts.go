// Package modules — additional Windows forensic artifact collection modules.
// Adds critical DFIR artifacts missing from the original set:
//   - BITS transfer event log (T1197)
//   - WMI Activity event log (T1546.003)
//   - PowerShell Script Block Logging (EID 4104)
//   - Windows hosts file (DNS hijacking detection)
//   - Full NIC configuration
//   - Windows Defender exclusions
//   - Windows 10/11 Activity Timeline (ActivitiesCache.db)
//   - AppCompat Shim Database (SDB persistence — T1546.011)
//   - Comprehensive installed software from registry
//   - Process tree with parent-child relationships
//   - Active connections with process names (structured)
//   - NTDS.dit domain controller database
//   - NetLogon log (pass-the-hash / lateral movement)
//   - IFEO (Image File Execution Options) debugger hijacking
package modules

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
)

// ── BITS Transfer Event Log ────────────────────────────────────────────────────
// Microsoft-Windows-Bits-Client/Operational
// BITS is abused for malware download and C2 communication (T1197).
// EID 59: job completed; EID 60: error; EID 16403: transfer job created.

type WindowsEventLogBITS struct{ BaseWindowsModule }

func NewWindowsEventLogBITS() *WindowsEventLogBITS {
	return &WindowsEventLogBITS{BaseWindowsModule{Module: NewModule(
		"windows_eventlog_bits",
		"logs/windows/bits_transfer.evtx",
	)}}
}

func (m *WindowsEventLogBITS) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	return exportEventLog(ctx, mctx, "Microsoft-Windows-Bits-Client/Operational", params, outputPath)
}

// ── WMI Activity Event Log ─────────────────────────────────────────────────────
// Microsoft-Windows-WMI-Activity/Operational
// Records WMI event subscriptions, queries, and provider loads.
// Critical for detecting WMI-based persistence and lateral movement (T1546.003).

type WindowsEventLogWMIActivity struct{ BaseWindowsModule }

func NewWindowsEventLogWMIActivity() *WindowsEventLogWMIActivity {
	return &WindowsEventLogWMIActivity{BaseWindowsModule{Module: NewModule(
		"windows_eventlog_wmi_activity",
		"logs/windows/wmi_activity.evtx",
	)}}
}

func (m *WindowsEventLogWMIActivity) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	return exportEventLog(ctx, mctx, "Microsoft-Windows-WMI-Activity/Operational", params, outputPath)
}

// ── PowerShell Script Block Logging ───────────────────────────────────────────
// Microsoft-Windows-PowerShell/Operational
// EID 4104 records full script block content including de-obfuscated payloads.
// Requires Script Block Logging to be enabled via Group Policy.

type WindowsEventLogPSScriptBlock struct{ BaseWindowsModule }

func NewWindowsEventLogPSScriptBlock() *WindowsEventLogPSScriptBlock {
	return &WindowsEventLogPSScriptBlock{BaseWindowsModule{Module: NewModule(
		"windows_eventlog_ps_scriptblock",
		"logs/windows/ps_scriptblock.evtx",
	)}}
}

func (m *WindowsEventLogPSScriptBlock) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	return exportEventLog(ctx, mctx, "Microsoft-Windows-PowerShell/Operational", params, outputPath)
}

// ── Windows Hosts File ─────────────────────────────────────────────────────────
// C:\Windows\System32\drivers\etc\hosts
// Always inspect: malware modifies this to redirect security tool domains,
// block AV updates, or hijack intranet hostnames.

type WindowsHostsFile struct{ BaseWindowsModule }

func NewWindowsHostsFile() *WindowsHostsFile {
	return &WindowsHostsFile{BaseWindowsModule{Module: NewModule(
		"windows_hosts_file",
		"system/windows/hosts_file.txt",
	)}}
}

func (m *WindowsHostsFile) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	if err := os.MkdirAll(filepath.Dir(outputPath), 0755); err != nil {
		return fmt.Errorf("mkdir failed: %w", err)
	}
	for _, candidate := range []string{
		`C:\Windows\System32\drivers\etc\hosts`,
		`C:\Windows\SysWOW64\drivers\etc\hosts`,
	} {
		if err := CopyFileNativeBackup(ctx, candidate, outputPath); err == nil {
			return nil
		}
	}
	_ = WriteNotFound(outputPath, "hosts file not found")
	return NewWarningError("windows_hosts_file: hosts file not accessible")
}

// ── Full Network Interface Configuration ──────────────────────────────────────
// Collects IP addresses, MAC, DHCP server, gateway, and DNS servers per NIC.
// Critical for network topology and lateral movement reconstruction.

type WindowsNetworkInterfaces struct{ BaseWindowsModule }

func NewWindowsNetworkInterfaces() *WindowsNetworkInterfaces {
	return &WindowsNetworkInterfaces{BaseWindowsModule{Module: NewModule(
		"windows_network_interfaces",
		"system/windows/network_interfaces.txt",
	)}}
}

func (m *WindowsNetworkInterfaces) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	command := `Write-Output "=== Adapters ===";` +
		`Get-NetAdapter -ErrorAction SilentlyContinue | Select-Object Name,InterfaceDescription,MacAddress,Status,LinkSpeed | Format-Table -AutoSize;` +
		`Write-Output "";` +
		`Write-Output "=== IP Addresses ===";` +
		`Get-NetIPAddress -ErrorAction SilentlyContinue | Select-Object InterfaceAlias,AddressFamily,IPAddress,PrefixLength,PrefixOrigin | Format-Table -AutoSize;` +
		`Write-Output "";` +
		`Write-Output "=== Default Routes ===";` +
		`Get-NetRoute -ErrorAction SilentlyContinue | Where-Object { $_.DestinationPrefix -match '^0\.0\.0\.0/0|^::/0$' } | Select-Object InterfaceAlias,DestinationPrefix,NextHop | Format-Table -AutoSize;` +
		`Write-Output "";` +
		`Write-Output "=== DNS Servers ===";` +
		`Get-DnsClientServerAddress -ErrorAction SilentlyContinue | Select-Object InterfaceAlias,AddressFamily,ServerAddresses | Format-Table -AutoSize;` +
		`Write-Output "";` +
		`Write-Output "=== ipconfig /all ===";` +
		`ipconfig /all`
	return runPowerShellToFile(ctx, command, outputPath, params)
}

// ── Windows Defender Exclusions ───────────────────────────────────────────────
// Defender exclusions from both Get-MpPreference and the registry.
// Attackers ALWAYS add malware paths/processes to exclusions — this is
// one of the most reliable IoC sources after any Windows compromise.

type WindowsDefenderExclusions struct{ BaseWindowsModule }

func NewWindowsDefenderExclusions() *WindowsDefenderExclusions {
	return &WindowsDefenderExclusions{BaseWindowsModule{Module: NewModule(
		"windows_defender_exclusions",
		"system/windows/defender_exclusions.txt",
	)}}
}

func (m *WindowsDefenderExclusions) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	command := `Write-Output "=== Windows Defender Exclusions ===";` +
		`$pref = Get-MpPreference -ErrorAction SilentlyContinue;` +
		`if ($pref) {` +
		`  Write-Output "-- Excluded Paths --";` +
		`  $pref.ExclusionPath | ForEach-Object { "  PATH: $_" };` +
		`  Write-Output "-- Excluded Processes --";` +
		`  $pref.ExclusionProcess | ForEach-Object { "  PROC: $_" };` +
		`  Write-Output "-- Excluded Extensions --";` +
		`  $pref.ExclusionExtension | ForEach-Object { "  EXT: $_" };` +
		`  Write-Output "-- Excluded IPs --";` +
		`  $pref.ExclusionIpAddress | ForEach-Object { "  IP: $_" };` +
		`  Write-Output "-- Realtime Protection Disabled: $($pref.DisableRealtimeMonitoring) --"` +
		`};` +
		`Write-Output "";` +
		`Write-Output "=== Registry Exclusions ===";` +
		`$base = "HKLM:\SOFTWARE\Microsoft\Windows Defender\Exclusions";` +
		`foreach ($sub in @("Paths","Processes","Extensions","IpAddresses","TemporaryPaths")) {` +
		`  $k = Join-Path $base $sub;` +
		`  if (Test-Path $k) {` +
		`    Write-Output "--- $sub ---";` +
		`    (Get-Item $k -ErrorAction SilentlyContinue).Property | ForEach-Object { "  $_" }` +
		`  }` +
		`}`
	return runPowerShellToFile(ctx, command, outputPath, params)
}

// ── Windows 10/11 Activity Timeline (ActivitiesCache.db) ──────────────────────
// Windows Timeline records per-app activity with timestamps and focus durations.
// Located in ConnectedDevicesPlatform folder per user.
// Parse with WxTCmd (Eric Zimmerman) for full activity analysis.

type WindowsTimeline struct{ BaseWindowsModule }

func NewWindowsTimeline() *WindowsTimeline {
	return &WindowsTimeline{BaseWindowsModule{Module: NewModule(
		"windows_timeline",
		"artifacts/windows/timeline/",
	)}}
}

func (m *WindowsTimeline) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	if err := os.MkdirAll(outputPath, 0755); err != nil {
		return fmt.Errorf("mkdir failed: %w", err)
	}
	profiles, err := getUserProfileDirs(ctx)
	if err != nil {
		_ = WriteNotFound(filepath.Join(outputPath, "error.txt"), err.Error())
		return NewWarningError(err.Error())
	}
	var collected int
	for _, profileDir := range profiles {
		uname := profileName(profileDir)
		cdpBase := filepath.Join(profileDir, `AppData\Local\ConnectedDevicesPlatform`)
		entries, err := os.ReadDir(cdpBase)
		if err != nil {
			continue
		}
		for _, entry := range entries {
			if !entry.IsDir() {
				continue
			}
			dbSrc := filepath.Join(cdpBase, entry.Name(), "ActivitiesCache.db")
			if _, err := os.Stat(dbSrc); err != nil {
				continue
			}
			dstName := fmt.Sprintf("%s_%s_ActivitiesCache.db", uname, entry.Name())
			if err := CopyFileNativeBackup(ctx, dbSrc, filepath.Join(outputPath, dstName)); err == nil {
				collected++
			}
		}
	}
	if collected == 0 {
		_ = WriteNotFound(filepath.Join(outputPath, "error.txt"), "no ActivitiesCache.db found (Windows Timeline may not be enabled)")
	}
	return nil
}

// ── AppCompat Shim Database (SDB) Files ───────────────────────────────────────
// Application Compatibility Shim databases — attackers use custom SDB files
// to inject DLLs or redirect executable calls (T1546.011).
// Also enumerates InstalledSDB and Custom registry keys.

type WindowsAppCompatShims struct{ BaseWindowsModule }

func NewWindowsAppCompatShims() *WindowsAppCompatShims {
	return &WindowsAppCompatShims{BaseWindowsModule{Module: NewModule(
		"windows_appcompat_shims",
		"artifacts/windows/appcompat_shims/",
	)}}
}

func (m *WindowsAppCompatShims) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	if err := os.MkdirAll(outputPath, 0755); err != nil {
		return fmt.Errorf("mkdir failed: %w", err)
	}
	// Copy SDB files from AppPatch directory
	for _, dir := range []string{`C:\Windows\AppPatch`, `C:\Windows\AppPatch\en-US`} {
		entries, err := os.ReadDir(dir)
		if err != nil {
			continue
		}
		for _, entry := range entries {
			if !entry.IsDir() && filepath.Ext(entry.Name()) == ".sdb" {
				src := filepath.Join(dir, entry.Name())
				_ = CopyFileNativeBackup(ctx, src, filepath.Join(outputPath, entry.Name()))
			}
		}
	}
	// Enumerate custom/installed SDB registry entries
	command := `Write-Output "=== Installed SDB Files ===";` +
		`$key = "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\AppCompatFlags\InstalledSDB";` +
		`if (Test-Path $key) {` +
		`  Get-ChildItem $key -ErrorAction SilentlyContinue |` +
		`  ForEach-Object { $p = Get-ItemProperty $_.PSPath -EA SilentlyContinue; "GUID=$($_.PSChildName) | DBPath=$($p.DatabasePath) | DBDesc=$($p.DatabaseDescription)" }` +
		`} else { "No InstalledSDB found." };` +
		`Write-Output "";` +
		`Write-Output "=== Custom SDB Entries ===";` +
		`$k2 = "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\AppCompatFlags\Custom";` +
		`if (Test-Path $k2) {` +
		`  Get-ChildItem $k2 -Recurse -ErrorAction SilentlyContinue | ForEach-Object { "$($_.PSPath): $($_.GetValueNames())" }` +
		`} else { "No Custom SDB entries found." }`
	_ = runPowerShellToFile(ctx, command, filepath.Join(outputPath, "sdb_registry.txt"), params)
	return nil
}

// ── Comprehensive Installed Software ─────────────────────────────────────────
// Collects installed software from HKLM 64-bit, HKLM 32-bit (WOW64), and HKCU.
// Includes install date to identify recently-installed tools or malware.

type WindowsInstalledSoftware struct{ BaseWindowsModule }

func NewWindowsInstalledSoftware() *WindowsInstalledSoftware {
	return &WindowsInstalledSoftware{BaseWindowsModule{Module: NewModule(
		"windows_installed_software",
		"system/windows/installed_software.csv",
	)}}
}

func (m *WindowsInstalledSoftware) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	command := `$paths = @(` +
		`  @{Path='HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*';Scope='x64'},` +
		`  @{Path='HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*';Scope='x86'},` +
		`  @{Path='HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*';Scope='User'}` +
		`);` +
		`$results = foreach ($p in $paths) {` +
		`  Get-ItemProperty $p.Path -ErrorAction SilentlyContinue |` +
		`  Where-Object { $_.DisplayName } |` +
		`  Select-Object @{N='Scope';E={$p.Scope}},DisplayName,DisplayVersion,Publisher,InstallDate,InstallLocation` +
		`};` +
		`$results | Sort-Object DisplayName | ConvertTo-Csv -NoTypeInformation`
	return runPowerShellToFile(ctx, command, outputPath, params)
}

// ── Process Tree with Parent-Child Relationships ──────────────────────────────
// Full process list with PPID — essential for detecting PPID spoofing (T1134.004),
// process injection origins, and LOLBin execution chains.

type WindowsProcessTree struct{ BaseWindowsModule }

func NewWindowsProcessTree() *WindowsProcessTree {
	return &WindowsProcessTree{BaseWindowsModule{Module: NewModule(
		"windows_process_tree",
		"volatile/windows/process_tree.csv",
	)}}
}

func (m *WindowsProcessTree) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	command := `Get-WmiObject Win32_Process -ErrorAction SilentlyContinue |` +
		`Select-Object ProcessId,ParentProcessId,Name,ExecutablePath,CommandLine,` +
		`@{N='Owner';E={(try{$o=$_.GetOwner();if($o.User){"$($o.Domain)\$($o.User)"}else{''}}catch{''})}},` +
		`@{N='CreationDate';E={$_.ConvertToDateTime($_.CreationDate)}} |` +
		`Sort-Object ParentProcessId,ProcessId |` +
		`ConvertTo-Csv -NoTypeInformation`
	return runPowerShellToFile(ctx, command, outputPath, params)
}

// ── Active Connections with Process Names ─────────────────────────────────────
// Structured TCP/UDP connections including PID and resolved process name.
// More detailed than windows_network_connections (which uses netstat plain text).

type WindowsActiveConnections struct{ BaseWindowsModule }

func NewWindowsActiveConnections() *WindowsActiveConnections {
	return &WindowsActiveConnections{BaseWindowsModule{Module: NewModule(
		"windows_active_connections",
		"volatile/windows/active_connections.csv",
	)}}
}

func (m *WindowsActiveConnections) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	command := `$procs = @{}; Get-Process -EA SilentlyContinue | % { $procs[$_.Id] = $_.Name };` +
		`$r = @();` +
		`Get-NetTCPConnection -EA SilentlyContinue | % {` +
		`  $r += [pscustomobject]@{Proto="TCP";LocalAddr=$_.LocalAddress;LocalPort=$_.LocalPort;` +
		`    RemoteAddr=$_.RemoteAddress;RemotePort=$_.RemotePort;State=$_.State;` +
		`    PID=$_.OwningProcess;Process=($procs[$_.OwningProcess]??'?')}` +
		`};` +
		`Get-NetUDPEndpoint -EA SilentlyContinue | % {` +
		`  $r += [pscustomobject]@{Proto="UDP";LocalAddr=$_.LocalAddress;LocalPort=$_.LocalPort;` +
		`    RemoteAddr="*";RemotePort="*";State="BOUND";` +
		`    PID=$_.OwningProcess;Process=($procs[$_.OwningProcess]??'?')}` +
		`};` +
		`$r | ConvertTo-Csv -NoTypeInformation`
	return runPowerShellToFile(ctx, command, outputPath, params)
}

// ── NTDS.dit — Domain Controller Database ─────────────────────────────────────
// Active Directory database containing all user hashes and group memberships.
// Only collected on Domain Controllers (C:\Windows\NTDS must exist).
// Must use VSS to copy the live file. Parse offline with secretsdump.py.

type WindowsNTDS struct{ BaseWindowsModule }

func NewWindowsNTDS() *WindowsNTDS {
	return &WindowsNTDS{BaseWindowsModule{Module: NewModule(
		"windows_ntds",
		"artifacts/windows/ntds/",
	)}}
}

func (m *WindowsNTDS) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	if err := os.MkdirAll(outputPath, 0755); err != nil {
		return fmt.Errorf("mkdir failed: %w", err)
	}
	if _, err := os.Stat(`C:\Windows\NTDS`); os.IsNotExist(err) {
		return WriteNotFound(filepath.Join(outputPath, "not_a_dc.txt"),
			"Not a Domain Controller (C:\\Windows\\NTDS does not exist)")
	}
	_, devicePath, cleanup, err := vssCreate(ctx, &m.BaseWindowsModule)
	defer cleanup()
	if err != nil {
		_ = WriteNotFound(filepath.Join(outputPath, "error.txt"), err.Error())
		return err
	}
	targets := []struct{ src, dst string }{
		{devicePath + `\Windows\NTDS\ntds.dit`, filepath.Join(outputPath, "ntds.dit")},
		{devicePath + `\Windows\System32\config\SYSTEM`, filepath.Join(outputPath, "SYSTEM")},
		{devicePath + `\Windows\System32\config\SECURITY`, filepath.Join(outputPath, "SECURITY")},
	}
	var errs []string
	for _, t := range targets {
		if err := CopyFileNativeBackup(ctx, t.src, t.dst); err != nil {
			errs = append(errs, fmt.Sprintf("%s: %v", filepath.Base(t.src), err))
		}
	}
	if len(errs) > 0 {
		writeErrors(outputPath, errs)
	}
	return nil
}

// ── NetLogon Log ──────────────────────────────────────────────────────────────
// NetLogon text log records domain authentication events including
// NTLM and Kerberos ticket requests. Key for detecting pass-the-hash,
// pass-the-ticket, and account enumeration.

type WindowsNetLogon struct{ BaseWindowsModule }

func NewWindowsNetLogon() *WindowsNetLogon {
	return &WindowsNetLogon{BaseWindowsModule{Module: NewModule(
		"windows_netlogon_log",
		"logs/windows/netlogon/",
	)}}
}

func (m *WindowsNetLogon) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	if err := os.MkdirAll(outputPath, 0755); err != nil {
		return fmt.Errorf("mkdir failed: %w", err)
	}
	var collected int
	for _, src := range []string{
		`C:\Windows\debug\netlogon.log`,
		`C:\Windows\debug\netlogon.bak`,
	} {
		dst := filepath.Join(outputPath, filepath.Base(src))
		if err := CopyFileNativeBackup(ctx, src, dst); err == nil {
			collected++
		}
	}
	if collected == 0 {
		return WriteNotFound(filepath.Join(outputPath, "error.txt"),
			"netlogon.log not found — NetLogon logging may not be enabled")
	}
	return nil
}

// ── IFEO — Image File Execution Options (Debugger Hijacking) ──────────────────
// Attackers set a "Debugger" value under IFEO to run their malware whenever
// the targeted process is launched (T1546.012).
// Also lists GlobalFlag values which can trigger silent process capture.

type WindowsIFEO struct{ BaseWindowsModule }

func NewWindowsIFEO() *WindowsIFEO {
	return &WindowsIFEO{BaseWindowsModule{Module: NewModule(
		"windows_ifeo",
		"persistence/windows/ifeo.txt",
	)}}
}

func (m *WindowsIFEO) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	command := `$key = "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Image File Execution Options";` +
		`Write-Output "=== IFEO — Image File Execution Options ===";` +
		`Write-Output "Debugger or GlobalFlag entries indicate potential hijacking/persistence";` +
		`Write-Output "";` +
		`Get-ChildItem $key -ErrorAction SilentlyContinue |` +
		`ForEach-Object {` +
		`  $p = Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue;` +
		`  if ($p.Debugger -or $p.GlobalFlag) {` +
		`    [PSCustomObject]@{Executable=$_.PSChildName;Debugger=$p.Debugger;GlobalFlag=$p.GlobalFlag} | ConvertTo-Json -Compress` +
		`  }` +
		`}`
	_ = exec.CommandContext // suppress unused import in case exec.CommandContext used elsewhere
	return runPowerShellToFile(ctx, command, outputPath, params)
}
