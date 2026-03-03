package modules

import (
	"context"
	"fmt"
	"os/exec"
)

type WindowsLocalUsers struct {
	BaseWindowsModule
}

type WindowsLoggedOnUsers struct {
	BaseWindowsModule
}

func NewWindowsLocalUsers() *WindowsLocalUsers {
	return &WindowsLocalUsers{BaseWindowsModule{Module: NewModule("windows_local_users", "system/windows/local_users.csv")}}
}

func NewWindowsLoggedOnUsers() *WindowsLoggedOnUsers {
	return &WindowsLoggedOnUsers{BaseWindowsModule{Module: NewModule("windows_logged_on_users", "system/windows/logged_on_users.txt")}}
}

func (m *WindowsLocalUsers) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	command := "Get-LocalUser | Select-Object Name,Enabled,LastLogon,Description | ConvertTo-Csv -NoTypeInformation"
	return runPowerShellToFile(ctx, command, outputPath, params)
}

func (m *WindowsLoggedOnUsers) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	cmd := exec.CommandContext(ctx, "quser")
	output, err := cmd.CombinedOutput()
	if err != nil {
		note := fmt.Sprintf("quser failed: %v", err)
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
