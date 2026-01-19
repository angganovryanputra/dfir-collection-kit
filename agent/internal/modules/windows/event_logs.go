package modules

import (
	"context"
	"fmt"
	"os/exec"
	"path/filepath"

	"github.com/dfir/agent/internal/logging"
)

// WindowsEventLogsSecurity collects Windows Security event logs
type WindowsEventLogsSecurity struct {
	Module
}

func (m *WindowsEventLogsSecurity) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	logging.WithJob(mctx.JobID).Info("Collecting Security event logs")

	// Get time window parameter (default 7 days)
	timeWindow := "7d"
	if tw, ok := params["time_window"].(string); ok && tw != "" {
		timeWindow = tw
	}

	// PowerShell command to export Security event log
	command := fmt.Sprintf(
		"Get-WinEvent -LogName Security -MaxEvents 10000 | Where-Object {$_.TimeCreated -lt (Get-Date).AddDays(-%s)} | Export-Csv -Path '%s' -NoTypeInformation",
		timeWindow,
		mctx.WorkDir,
	)

	output, err := getPowerShellCommand(command)
	if err := nil {
		return fmt.Errorf("failed to collect Security event logs: %w", err)
	}

	if err := os.WriteFile(outputPath, []byte(output), 0644); err != nil {
		return fmt.Errorf("failed to write Security event logs: %w", err)
	}

	logging.WithJob(mctx.JobID).Info("Security event logs collected: %d events", countLines(output))
	return nil
}

func (m *WindowsEventLogsSecurity) ID() string { return "windows_event_logs_security_7d" }

// WindowsEventLogsSystem collects Windows System event logs
type WindowsEventLogsSystem struct {
	Module
}

func (m *WindowsEventLogsSystem) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	logging.WithJob(mctx.JobID).Info("Collecting System event logs")

	// Get time window parameter (default 7 days)
	timeWindow := "7d"
	if tw, ok := params["time_window"].(string); ok && tw != "" {
		timeWindow = tw
	}

	// PowerShell command to export System event log
	command := fmt.Sprintf(
		"Get-WinEvent -LogName System -MaxEvents 10000 | Where-Object {$_.TimeCreated -lt (Get-Date).AddDays(-%s)} | Export-Csv -Path '%s' -NoTypeInformation",
		timeWindow,
		mctx.WorkDir,
	)

	output, err := getPowerShellCommand(command)
	if err != nil {
		return fmt.Errorf("failed to collect System event logs: %w", err)
	}

	if err := os.WriteFile(outputPath, []byte(output), 0644); err != nil {
		return fmt.Errorf("failed to write System event logs: %w", err)
	}

	logging.WithJob(mctx.JobID).Info("System event logs collected: %d events", countLines(output))
	return nil
}

func (m *WindowsEventLogsSystem) ID() string { return "windows_event_logs_system_7d" }

// WindowsEventLogsPowerShell collects Windows PowerShell event logs
type WindowsEventLogsPowerShell struct {
	Module
}

func (m *WindowsEventLogsPowerShell) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	logging.WithJob(mctx.JobID).Info("Collecting PowerShell event logs")

	// Get time window parameter (default 7 days)
	timeWindow := "7d"
	if tw, ok := params["time_window"].(string); ok && tw != "" {
		timeWindow = tw
	}

	// PowerShell command to export PowerShell event log
	command := fmt.Sprintf(
		"Get-WinEvent -LogName 'Windows PowerShell' -MaxEvents 10000 | Where-Object {$_.TimeCreated -lt (Get-Date).AddDays(-%s)} | Export-Csv -Path '%s' -NoTypeInformation",
		timeWindow,
		mctx.WorkDir,
	)

	output, err := getPowerShellCommand(command)
	if err != nil {
		return fmt.Errorf("failed to collect PowerShell event logs: %w", err)
	}

	if err := os.WriteFile(outputPath, []byte(output), 0644); err != nil {
		return fmt.Errorf("failed to write PowerShell event logs: %w", err)
	}

	logging.WithJob(mctx.JobID).Info("PowerShell event logs collected: %d events", countLines(output))
	return nil
}

func (m *WindowsEventLogsPowerShell) ID() string { return "windows_event_logs_powershell_7d" }

// WindowsProcessList collects running processes on Windows
type WindowsProcessList struct {
	Module
}

func (m *WindowsProcessList) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	logging.WithJob(mctx.JobID).Info("Collecting process list")

	// PowerShell command to get running processes
	command := "Get-Process | Select-Object Id,ProcessName,CPU,WorkingSet,VirtualMemorySize | Sort-Object VirtualMemorySize -Descending | Export-Csv -Path '' -NoTypeInformation"

	output, err := getPowerShellCommand(command)
	if err != nil {
		return fmt.Errorf("failed to collect process list: %w", err)
	}

	if err := os.WriteFile(outputPath, []byte(output), 0644); err != nil {
		return fmt.Errorf("failed to write process list: %w", err)
	}

	logging.WithJob(mctx.JobID).Info("Process list collected: %d processes", countLines(output))
	return nil
}

func (m *WindowsProcessList) ID() string { return "windows_process_list" }

// WindowsNetworkConnections collects network connections on Windows
type WindowsNetworkConnections struct {
	Module
}

func (m *WindowsNetworkConnections) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	logging.WithJob(mctx.JobID).Info("Collecting network connections")

	// PowerShell command to get network connections
	command := "Get-NetTCPConnection -State Established,Listening | Select-Object LocalAddress,LocalPort,RemoteAddress,RemotePort,State,OwningProcess | Export-Csv -Path '' -NoTypeInformation"

	output, err := getPowerShellCommand(command)
	if err != nil {
		return fmt.Errorf("failed to collect network connections: %w", err)
	}

	if err := os.WriteFile(outputPath, []byte(output), 0644); err != nil {
		return fmt.Errorf("failed to write network connections: %w", err)
	}

	logging.WithJob(mctx.JobID).Info("Network connections collected: %d connections", countLines(output))
	return nil
}

func (m *WindowsNetworkConnections) ID() string { return "windows_network_connections" }

// WindowsScheduledTasks collects scheduled tasks on Windows
type WindowsScheduledTasks struct {
	Module
}

func (m *WindowsScheduledTasks) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	logging.WithJob(mctx.JobID).Info("Collecting scheduled tasks")

	// PowerShell command to get scheduled tasks
	command := "Get-ScheduledTask | Select-Object TaskName,State,Trigger,LastRunTime,NextRunTime | Export-Csv -Path '' -NoTypeInformation"

	output, err := getPowerShellCommand(command)
	if err != nil {
		return fmt.Errorf("failed to collect scheduled tasks: %w", err)
	}

	if err := os.WriteFile(outputPath, []byte(output), 0644); err != nil {
		return fmt.Errorf("failed to write scheduled tasks: %w", err)
	}

	logging.WithJob(mctx.JobID).Info("Scheduled tasks collected: %d tasks", countLines(output))
	return nil
}

func (m *WindowsScheduledTasks) ID() string { return "windows_scheduled_tasks" }

// WindowsAutorunsBasic collects basic autorun entries on Windows
type WindowsAutorunsBasic struct {
	Module
}

func (m *WindowsAutorunsBasic) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	logging.WithJob(mctx.JobID).Info("Collecting autorun entries")

	// PowerShell command to get autorun entries
	command := "Get-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run' -Name '*' | Select-Object PropertyName,Value | Export-Csv -Path '' -NoTypeInformation"

	output, err := getPowerShellCommand(command)
	if err != nil {
		return fmt.Errorf("failed to collect autorun entries: %w", err)
	}

	if err := os.WriteFile(outputPath, []byte(output), 0644); err != nil {
		return fmt.Errorf("failed to write autorun entries: %w", err)
	}

	logging.WithJob(mctx.JobID).Info("Autorun entries collected: %d entries", countLines(output))
	return nil
}

func (m *WindowsAutorunsBasic) ID() string { return "windows_autoruns_basic" }

// countLines returns the approximate number of lines in a CSV-like string
func countLines(s string) int {
	count := 0
	for _, c := range s {
		if c == '\n' {
			count++
		}
	}
	return count
}
