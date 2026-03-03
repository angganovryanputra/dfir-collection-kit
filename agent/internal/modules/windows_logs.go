package modules

import (
	"context"
	"fmt"
	"os/exec"
	"time"
)

type WindowsEventLogSecurity struct {
	BaseWindowsModule
}

type WindowsEventLogSystem struct {
	BaseWindowsModule
}

type WindowsEventLogApplication struct {
	BaseWindowsModule
}

type WindowsEventLogPowerShellOperational struct {
	BaseWindowsModule
}

type WindowsEventLogSysmonOperational struct {
	BaseWindowsModule
}

func NewWindowsEventLogSecurity() *WindowsEventLogSecurity {
	return &WindowsEventLogSecurity{BaseWindowsModule{Module: NewModule("windows_eventlog_security", "logs/windows/security.evtx")}}
}

func NewWindowsEventLogSystem() *WindowsEventLogSystem {
	return &WindowsEventLogSystem{BaseWindowsModule{Module: NewModule("windows_eventlog_system", "logs/windows/system.evtx")}}
}

func NewWindowsEventLogApplication() *WindowsEventLogApplication {
	return &WindowsEventLogApplication{BaseWindowsModule{Module: NewModule("windows_eventlog_application", "logs/windows/application.evtx")}}
}

func NewWindowsEventLogPowerShellOperational() *WindowsEventLogPowerShellOperational {
	return &WindowsEventLogPowerShellOperational{BaseWindowsModule{Module: NewModule("windows_eventlog_powershell_operational", "logs/windows/powershell_operational.evtx")}}
}

func NewWindowsEventLogSysmonOperational() *WindowsEventLogSysmonOperational {
	return &WindowsEventLogSysmonOperational{BaseWindowsModule{Module: NewModule("windows_eventlog_sysmon_operational", "logs/windows/sysmon_operational.evtx")}}
}

func (m *WindowsEventLogSecurity) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	return exportEventLog(ctx, mctx, "Security", params, outputPath)
}

func (m *WindowsEventLogSystem) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	return exportEventLog(ctx, mctx, "System", params, outputPath)
}

func (m *WindowsEventLogApplication) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	return exportEventLog(ctx, mctx, "Application", params, outputPath)
}

func (m *WindowsEventLogPowerShellOperational) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	return exportEventLog(ctx, mctx, "Microsoft-Windows-PowerShell/Operational", params, outputPath)
}

func (m *WindowsEventLogSysmonOperational) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	return exportEventLog(ctx, mctx, "Microsoft-Windows-Sysmon/Operational", params, outputPath)
}

func exportEventLog(ctx context.Context, mctx ModuleContext, logName string, params map[string]interface{}, outputPath string) error {
	if err := EnsureOutputDir(outputPath); err != nil {
		return err
	}

	days := GetTimeWindowDays(params)
	query := buildEvtQuery(days)

	cmd := exec.CommandContext(ctx, "wevtutil", "epl", logName, outputPath, "/q:"+query)
	if output, err := cmd.CombinedOutput(); err != nil {
		note := fmt.Sprintf("event log %s not collected: %s", logName, string(output))
		if !mctx.IsAdmin {
			note = fmt.Sprintf("event log %s not collected (requires admin): %s", logName, string(output))
		}
		if writeErr := WriteNotFound(outputPath, note); writeErr != nil {
			return writeErr
		}
		return NewWarningError(note)
	}

	return nil
}

func buildEvtQuery(days int) string {
	ms := int64(days) * int64(24*time.Hour/time.Millisecond)
	return fmt.Sprintf("*[System[TimeCreated[timediff(@SystemTime) <= %d]]]", ms)
}
