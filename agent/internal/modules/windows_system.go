package modules

import (
	"context"
	"fmt"
	"os/exec"
)

type WindowsSystemInfo struct {
	BaseWindowsModule
}

type WindowsInstalledPatches struct {
	BaseWindowsModule
}

type WindowsTimezone struct {
	BaseWindowsModule
}

type WindowsBootTime struct {
	BaseWindowsModule
}

func NewWindowsSystemInfo() *WindowsSystemInfo {
	return &WindowsSystemInfo{BaseWindowsModule{Module: NewModule("windows_system_info", "system/windows/system_info.txt")}}
}

func NewWindowsInstalledPatches() *WindowsInstalledPatches {
	return &WindowsInstalledPatches{BaseWindowsModule{Module: NewModule("windows_installed_patches", "system/windows/installed_patches.csv")}}
}

func NewWindowsTimezone() *WindowsTimezone {
	return &WindowsTimezone{BaseWindowsModule{Module: NewModule("windows_timezone", "system/windows/timezone.txt")}}
}

func NewWindowsBootTime() *WindowsBootTime {
	return &WindowsBootTime{BaseWindowsModule{Module: NewModule("windows_boot_time", "system/windows/boot_time.txt")}}
}

func (m *WindowsSystemInfo) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	cmd := exec.CommandContext(ctx, "systeminfo")
	output, err := cmd.CombinedOutput()
	if err != nil {
		note := fmt.Sprintf("systeminfo failed: %v", err)
		if writeErr := WriteNotFound(outputPath, note); writeErr != nil {
			return writeErr
		}
		return NewWarningError(note)
	}
	maxLines, _ := GetMaxLines(params)
	maxSize, _ := GetMaxSizeMB(params)
	output = LimitOutput(output, maxLines, maxSize)
	return WriteOutput(outputPath, output)
}

func (m *WindowsInstalledPatches) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	command := "Get-HotFix | Select-Object HotFixID,InstalledOn,Description | ConvertTo-Csv -NoTypeInformation"
	return runPowerShellToFile(ctx, command, outputPath, params)
}

func (m *WindowsTimezone) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	cmd := exec.CommandContext(ctx, "tzutil", "/g")
	output, err := cmd.CombinedOutput()
	if err != nil {
		note := fmt.Sprintf("tzutil failed: %v", err)
		if writeErr := WriteNotFound(outputPath, note); writeErr != nil {
			return writeErr
		}
		return NewWarningError(note)
	}
	return WriteOutput(outputPath, output)
}

func (m *WindowsBootTime) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	command := "(Get-CimInstance Win32_OperatingSystem).LastBootUpTime"
	output, err := (&BaseWindowsModule{}).executePowerShell(ctx, getPowerShellCommand(command))
	if err != nil {
		return err
	}
	return WriteOutput(outputPath, output)
}
