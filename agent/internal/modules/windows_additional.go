// Package modules — additional Windows forensic artifact collection modules.
// These modules complement the KAPE-like artifact set with execution history,
// user activity, Defender events, firewall, SRUM, and environment data.
package modules

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
)

// ── PowerShell Command History (PSReadLine) ───────────────────────────────────
// Collects PSReadLine ConsoleHost_history.txt per user.
// Contains plaintext history of all interactive PowerShell commands —
// one of the most valuable artifacts for detecting attacker activity.

type WindowsPowerShellHistory struct{ BaseWindowsModule }

func NewWindowsPowerShellHistory() *WindowsPowerShellHistory {
	return &WindowsPowerShellHistory{BaseWindowsModule{Module: NewModule(
		"windows_powershell_history",
		"artifacts/windows/powershell_history/",
	)}}
}

func (m *WindowsPowerShellHistory) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	profiles, err := getUserProfileDirs(ctx)
	if err != nil {
		_ = WriteNotFound(filepath.Join(outputPath, "error.txt"), err.Error())
		return NewWarningError(err.Error())
	}
	var collected int
	for _, profileDir := range profiles {
		uname := profileName(profileDir)
		histPath := filepath.Join(profileDir, `AppData\Roaming\Microsoft\Windows\PowerShell\PSReadline\ConsoleHost_history.txt`)
		dstPath := filepath.Join(outputPath, uname+"_ConsoleHost_history.txt")
		if err := copyNative(ctx, filepath.Dir(histPath), filepath.Base(histPath), filepath.Dir(dstPath)); err == nil {
			collected++
		}
	}
	if collected == 0 {
		return WriteNotFound(filepath.Join(outputPath, "error.txt"), "no PSReadLine history files found")
	}
	return nil
}

// ── UserAssist (Program Execution Tracking) ───────────────────────────────────
// Queries the UserAssist registry keys that record GUI program execution counts
// and last run timestamps. Stored ROT-13 encoded under HKCU.
// Key artifact for proving program execution on a system.

type WindowsUserAssist struct{ BaseWindowsModule }

func NewWindowsUserAssist() *WindowsUserAssist {
	return &WindowsUserAssist{BaseWindowsModule{Module: NewModule(
		"windows_user_assist",
		"artifacts/windows/user_assist.csv",
	)}}
}

func (m *WindowsUserAssist) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	command := `$results = @();` +
		`$uaBase = 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\UserAssist';` +
		`if (Test-Path $uaBase) {` +
		`  foreach ($guid in (Get-ChildItem $uaBase -ErrorAction SilentlyContinue)) {` +
		`    $countKey = Join-Path $guid.PSPath 'Count';` +
		`    if (Test-Path $countKey) {` +
		`      $props = Get-ItemProperty $countKey -ErrorAction SilentlyContinue;` +
		`      foreach ($name in ($props.PSObject.Properties | Where-Object { $_.Name -notlike 'PS*' } | Select-Object -ExpandProperty Name)) {` +
		`        $raw = $props.$name;` +
		`        if ($raw -is [byte[]] -and $raw.Length -ge 72) {` +
		`          $count   = [BitConverter]::ToInt32($raw, 4);` +
		`          $lastRun = [DateTime]::FromFileTime([BitConverter]::ToInt64($raw, 60));` +
		`          $results += [PSCustomObject]@{ Program=$name; RunCount=$count; LastRun=$lastRun; GUID=$guid.PSChildName }` +
		`        }` +
		`      }` +
		`    }` +
		`  }` +
		`};` +
		`$results | Sort-Object LastRun -Descending | ConvertTo-Csv -NoTypeInformation`
	return runPowerShellToFile(ctx, command, outputPath, params)
}

// ── RDP Connection History ────────────────────────────────────────────────────
// Enumerates Remote Desktop client connection history from the registry.
// Lists servers the user has connected to — key for lateral movement investigation.

type WindowsRDPHistory struct{ BaseWindowsModule }

func NewWindowsRDPHistory() *WindowsRDPHistory {
	return &WindowsRDPHistory{BaseWindowsModule{Module: NewModule(
		"windows_rdp_history",
		"artifacts/windows/rdp_history.txt",
	)}}
}

func (m *WindowsRDPHistory) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	command := `Write-Output "=== RDP Client MRU ===";` +
		`$mru = 'HKCU:\SOFTWARE\Microsoft\Terminal Server Client\Default';` +
		`if (Test-Path $mru) {` +
		`  Get-ItemProperty $mru -ErrorAction SilentlyContinue |` +
		`  Get-Member -MemberType NoteProperty | Where-Object { $_.Name -like 'MRU*' } |` +
		`  ForEach-Object { $name = $_.Name; [PSCustomObject]@{ Entry=$name; Server=(Get-ItemPropertyValue $mru $name) } }` +
		`  | Format-Table -AutoSize` +
		`} else { Write-Output "No RDP MRU entries found." };` +
		`Write-Output "";` +
		`Write-Output "=== RDP Server Entries ===";` +
		`$servers = 'HKCU:\SOFTWARE\Microsoft\Terminal Server Client\Servers';` +
		`if (Test-Path $servers) {` +
		`  Get-ChildItem $servers -ErrorAction SilentlyContinue |` +
		`  ForEach-Object {` +
		`    $props = Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue;` +
		`    [PSCustomObject]@{ Server=$_.PSChildName; UsernameHint=$props.UsernameHint }` +
		`  } | Format-Table -AutoSize` +
		`} else { Write-Output "No saved server entries found." }`
	return runPowerShellToFile(ctx, command, outputPath, params)
}

// ── Windows Defender Event Logs ───────────────────────────────────────────────
// Exports the Windows Defender operational and detection EVTX logs.
// Essential for identifying detected malware, quarantined files, and scan activity.

type WindowsDefenderEvents struct{ BaseWindowsModule }

func NewWindowsDefenderEvents() *WindowsDefenderEvents {
	return &WindowsDefenderEvents{BaseWindowsModule{Module: NewModule(
		"windows_defender_events",
		"logs/windows/defender/",
	)}}
}

func (m *WindowsDefenderEvents) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	if err := os.MkdirAll(outputPath, 0755); err != nil {
		return fmt.Errorf("failed to create output dir: %w", err)
	}
	logs := []struct{ name, file string }{
		{"Microsoft-Windows-Windows Defender/Operational", "defender_operational.evtx"},
		{"Microsoft-Windows-Windows Defender/WHC", "defender_whc.evtx"},
	}

	var errs []string
	for _, log := range logs {
		dstPath := filepath.Join(outputPath, log.file)
		if err := exportEventLog(ctx, mctx, log.name, params, dstPath); err != nil {
			errs = append(errs, fmt.Sprintf("%s: %v", log.name, err))
		}
	}

	// Also export Defender detections from registry
	detCommand := `$key = 'HKLM:\SOFTWARE\Microsoft\Windows Defender\Quarantine';` +
		`if (Test-Path $key) {` +
		`  "=== Quarantine Entries ===";` +
		`  Get-ChildItem $key -Recurse -ErrorAction SilentlyContinue |` +
		`  ForEach-Object { $_.PSPath }` +
		`} else { "Defender quarantine key not accessible." }`
	_ = runPowerShellToFile(ctx, detCommand, filepath.Join(outputPath, "quarantine_keys.txt"), params)

	if len(errs) > 0 {
		writeErrors(outputPath, errs)
	}
	return nil
}

// ── SRUM Database (Software Resource Usage Monitor) ──────────────────────────
// Copies the SRUM database (SRUDB.dat) via VSS snapshot.
// SRUM records per-application CPU/network/energy usage with timestamps —
// proves program execution and network activity even after log clearing.
// Parse with srum-dump or ESEDatabaseView.

type WindowsSRUM struct{ BaseWindowsModule }

func NewWindowsSRUM() *WindowsSRUM {
	return &WindowsSRUM{BaseWindowsModule{Module: NewModule(
		"windows_srum",
		"artifacts/windows/srum/",
	)}}
}

func (m *WindowsSRUM) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	if err := os.MkdirAll(outputPath, 0755); err != nil {
		return fmt.Errorf("failed to create output dir: %w", err)
	}

	// SRUDB.dat is always locked by the OS — must use VSS
	_, devicePath, cleanup, err := vssCreate(ctx, &m.BaseWindowsModule)
	defer cleanup()
	if err != nil {
		_ = WriteNotFound(filepath.Join(outputPath, "error.txt"), err.Error())
		return err
	}

	srumSrc := devicePath + `\Windows\System32\sru\SRUDB.dat`
	srumDst := filepath.Join(outputPath, "SRUDB.dat")
	if copyErr := CopyFileNativeBackup(ctx, srumSrc, srumDst); copyErr != nil {
		msg := fmt.Sprintf("SRUM copy failed: %v", copyErr)
		_ = WriteNotFound(filepath.Join(outputPath, "error.txt"), msg)
		return NewWarningError(msg)
	}

	// Also copy the SOFTWARE hive for SRUM app name resolution
	softwareSrc := devicePath + `\Windows\System32\config\SOFTWARE`
	_ = CopyFileNativeBackup(ctx, softwareSrc, filepath.Join(outputPath, "SOFTWARE"))

	return nil
}

// ── Scheduled Tasks (Raw XML) ─────────────────────────────────────────────────
// Copies raw XML task definition files from C:\Windows\System32\Tasks.
// The XML files contain the full task configuration including actions, triggers,
// and principals — more complete than schtasks.exe output.

type WindowsScheduledTasksXML struct{ BaseWindowsModule }

func NewWindowsScheduledTasksXML() *WindowsScheduledTasksXML {
	return &WindowsScheduledTasksXML{BaseWindowsModule{Module: NewModule(
		"windows_scheduled_tasks_xml",
		"artifacts/windows/tasks_xml/",
	)}}
}

func (m *WindowsScheduledTasksXML) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	tasksDir := `C:\Windows\System32\Tasks`
	if err := copyNativeRecursive(ctx, tasksDir, outputPath); err != nil {
		note := fmt.Sprintf("task XML collection failed (requires admin): %v", err)
		_ = WriteNotFound(filepath.Join(outputPath, "error.txt"), note)
		return NewWarningError(note)
	}
	return nil
}

// ── Windows Firewall Rules ────────────────────────────────────────────────────
// Exports Windows Firewall configuration and all inbound/outbound rules.
// Useful for identifying attacker-added rules that allow C2 traffic.

type WindowsFirewallRules struct{ BaseWindowsModule }

func NewWindowsFirewallRules() *WindowsFirewallRules {
	return &WindowsFirewallRules{BaseWindowsModule{Module: NewModule(
		"windows_firewall_rules",
		"artifacts/windows/firewall_rules.csv",
	)}}
}

func (m *WindowsFirewallRules) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	command := `Get-NetFirewallRule -All -ErrorAction SilentlyContinue |` +
		`Select-Object Name,DisplayName,Description,Direction,Action,Enabled,Profile,EdgeTraversalPolicy |` +
		`ConvertTo-Csv -NoTypeInformation`
	return runPowerShellToFile(ctx, command, outputPath, params)
}

// ── Windows Firewall Log Files ────────────────────────────────────────────────
// Copies Windows Firewall log files (pfirewall.log) which record allowed/dropped
// packets per network profile. Requires firewall logging to be enabled.

type WindowsFirewallLogs struct{ BaseWindowsModule }

func NewWindowsFirewallLogs() *WindowsFirewallLogs {
	return &WindowsFirewallLogs{BaseWindowsModule{Module: NewModule(
		"windows_firewall_logs",
		"artifacts/windows/firewall_logs/",
	)}}
}

func (m *WindowsFirewallLogs) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	if err := os.MkdirAll(outputPath, 0755); err != nil {
		return fmt.Errorf("failed to create output dir: %w", err)
	}

	logDirs := []string{
		`C:\Windows\System32\LogFiles\Firewall`,
		`C:\Windows\SysWOW64\LogFiles\Firewall`,
	}

	var collected int
	for _, dir := range logDirs {
		if _, err := os.Stat(dir); err != nil {
			continue
		}
		profileName := sanitizeFileName(filepath.Base(dir))
		dstDir := filepath.Join(outputPath, profileName)
		if err := copyNative(ctx, dir, "pfirewall*.log", dstDir); err == nil {
			collected++
		}
	}

	if collected == 0 {
		return WriteNotFound(filepath.Join(outputPath, "error.txt"),
			"no firewall logs found — firewall logging may not be enabled")
	}
	return nil
}

// ── Environment Variables ─────────────────────────────────────────────────────
// Collects system and user environment variables.
// Attackers often manipulate PATH, PSModulePath, or APPDATA for persistence.

type WindowsEnvVars struct{ BaseWindowsModule }

func NewWindowsEnvVars() *WindowsEnvVars {
	return &WindowsEnvVars{BaseWindowsModule{Module: NewModule(
		"windows_env_vars",
		"system/windows/env_vars.csv",
	)}}
}

func (m *WindowsEnvVars) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	command := `Write-Output "=== Process / Current User Environment ===";` +
		`[System.Environment]::GetEnvironmentVariables('Process').GetEnumerator() |` +
		`Sort-Object Key |` +
		`ForEach-Object { [PSCustomObject]@{ Scope='Process'; Name=$_.Key; Value=$_.Value } } |` +
		`ConvertTo-Csv -NoTypeInformation;` +
		`Write-Output "";` +
		`Write-Output "=== Machine (System) Environment ===";` +
		`[System.Environment]::GetEnvironmentVariables('Machine').GetEnumerator() |` +
		`Sort-Object Key |` +
		`ForEach-Object { [PSCustomObject]@{ Scope='Machine'; Name=$_.Key; Value=$_.Value } } |` +
		`ConvertTo-Csv -NoTypeInformation`
	return runPowerShellToFile(ctx, command, outputPath, params)
}

// ── Browser History — Firefox ─────────────────────────────────────────────────
// Copies Firefox SQLite profile databases (places.sqlite, logins.json, etc.)
// for all users. Complements Chrome and Edge collection.

type WindowsBrowserFirefox struct{ BaseWindowsModule }

func NewWindowsBrowserFirefox() *WindowsBrowserFirefox {
	return &WindowsBrowserFirefox{BaseWindowsModule{Module: NewModule(
		"windows_browser_firefox",
		"artifacts/windows/browser/firefox/",
	)}}
}

func (m *WindowsBrowserFirefox) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	profiles, err := getUserProfileDirs(ctx)
	if err != nil {
		_ = WriteNotFound(filepath.Join(outputPath, "error.txt"), err.Error())
		return NewWarningError(err.Error())
	}

	firefoxFiles := []string{"places.sqlite", "logins.json", "cookies.sqlite", "formhistory.sqlite", "key4.db"}
	for _, profileDir := range profiles {
		uname := profileName(profileDir)
		profilesDir := filepath.Join(profileDir, `AppData\Roaming\Mozilla\Firefox\Profiles`)
		entries, err := os.ReadDir(profilesDir)
		if err != nil {
			continue
		}
		for _, entry := range entries {
			if !entry.IsDir() {
				continue
			}
			srcDir := filepath.Join(profilesDir, entry.Name())
			dstDir := filepath.Join(outputPath, uname, entry.Name())
			for _, f := range firefoxFiles {
				_ = copyNative(ctx, srcDir, f, dstDir)
			}
		}
	}
	return nil
}

// ── WMI Repository ────────────────────────────────────────────────────────────
// Copies the WMI repository directory which contains compiled WMI subscriptions,
// event consumers, and namespaces. Essential for detecting WMI-based persistence
// that may not appear in standard WMI enumeration.

type WindowsWMIRepository struct{ BaseWindowsModule }

func NewWindowsWMIRepository() *WindowsWMIRepository {
	return &WindowsWMIRepository{BaseWindowsModule{Module: NewModule(
		"windows_wmi_repository",
		"artifacts/windows/wmi_repository/",
	)}}
}

func (m *WindowsWMIRepository) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	wmiDir := `C:\Windows\System32\wbem\Repository`
	if err := copyNativeRecursive(ctx, wmiDir, outputPath); err != nil {
		note := fmt.Sprintf("WMI repository collection failed (requires admin): %v", err)
		_ = WriteNotFound(filepath.Join(outputPath, "error.txt"), note)
		return NewWarningError(note)
	}
	return nil
}

// ── Windows Event Log — Task Scheduler ───────────────────────────────────────
// Exports the Task Scheduler operational log which records task creation,
// modification, deletion, and execution — key for scheduled task persistence.

type WindowsEventLogTaskScheduler struct{ BaseWindowsModule }

func NewWindowsEventLogTaskScheduler() *WindowsEventLogTaskScheduler {
	return &WindowsEventLogTaskScheduler{BaseWindowsModule{Module: NewModule(
		"windows_eventlog_task_scheduler",
		"logs/windows/task_scheduler.evtx",
	)}}
}

func (m *WindowsEventLogTaskScheduler) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	return exportEventLog(ctx, mctx, "Microsoft-Windows-TaskScheduler/Operational", params, outputPath)
}

// ── Typed URLs (IE/Edge Legacy) ───────────────────────────────────────────────
// Collects URLs typed directly in the browser address bar (Internet Explorer,
// legacy Edge, and Explorer). Records URL and frequency of access.

type WindowsTypedURLs struct{ BaseWindowsModule }

func NewWindowsTypedURLs() *WindowsTypedURLs {
	return &WindowsTypedURLs{BaseWindowsModule{Module: NewModule(
		"windows_typed_urls",
		"artifacts/windows/typed_urls.txt",
	)}}
}

func (m *WindowsTypedURLs) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	command := `$keys = @(` +
		`'HKCU:\SOFTWARE\Microsoft\Internet Explorer\TypedURLs',` +
		`'HKCU:\SOFTWARE\Microsoft\Internet Explorer\TypedURLsTime'` +
		`);` +
		`foreach ($key in $keys) {` +
		`  Write-Output "=== $key ===";` +
		`  if (Test-Path $key) {` +
		`    Get-ItemProperty $key -ErrorAction SilentlyContinue |` +
		`    Get-Member -MemberType NoteProperty |` +
		`    Where-Object { $_.Name -notlike 'PS*' } |` +
		`    ForEach-Object { $n=$_.Name; "$n = $((Get-ItemPropertyValue $key $n))" }` +
		`  } else { "NOT FOUND: $key" };` +
		`  Write-Output ""` +
		`}`
	return runPowerShellToFile(ctx, command, outputPath, params)
}

// ── Network Shares ────────────────────────────────────────────────────────────
// Enumerates configured network shares and mapped drives.
// Attackers often use shares for lateral movement and data staging.

type WindowsNetworkShares struct{ BaseWindowsModule }

func NewWindowsNetworkShares() *WindowsNetworkShares {
	return &WindowsNetworkShares{BaseWindowsModule{Module: NewModule(
		"windows_network_shares",
		"system/windows/network_shares.csv",
	)}}
}

func (m *WindowsNetworkShares) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	command := `Write-Output "=== Shared Folders ===";` +
		`Get-SmbShare -ErrorAction SilentlyContinue |` +
		`Select-Object Name,Path,Description,CurrentUsers,EncryptData |` +
		`ConvertTo-Csv -NoTypeInformation;` +
		`Write-Output "";` +
		`Write-Output "=== Mapped Network Drives ===";` +
		`Get-PSDrive -PSProvider FileSystem -ErrorAction SilentlyContinue |` +
		`Where-Object { $_.DisplayRoot -like '\\*' } |` +
		`Select-Object Name,Root,DisplayRoot |` +
		`ConvertTo-Csv -NoTypeInformation;` +
		`Write-Output "";` +
		`Write-Output "=== Net Use Sessions ===";` +
		`net use 2>&1`
	return runPowerShellToFile(ctx, command, outputPath, params)
}

