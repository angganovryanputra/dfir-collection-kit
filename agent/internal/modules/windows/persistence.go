package modules

import (
	"context"
	"fmt"
	"os/exec"
)

type WindowsScheduledTasks struct {
	BaseWindowsModule
}

type WindowsServices struct {
	BaseWindowsModule
}

type WindowsRunKeys struct {
	BaseWindowsModule
}

type WindowsStartupFolders struct {
	BaseWindowsModule
}

type WindowsWmiEventSubscriptions struct {
	BaseWindowsModule
}

func NewWindowsScheduledTasks() *WindowsScheduledTasks {
	return &WindowsScheduledTasks{BaseWindowsModule{Module: NewModule("windows_scheduled_tasks", "persistence/windows/scheduled_tasks.txt")}}
}

func NewWindowsServices() *WindowsServices {
	return &WindowsServices{BaseWindowsModule{Module: NewModule("windows_services", "persistence/windows/services.csv")}}
}

func NewWindowsRunKeys() *WindowsRunKeys {
	return &WindowsRunKeys{BaseWindowsModule{Module: NewModule("windows_registry_run_keys", "persistence/windows/run_keys.txt")}}
}

func NewWindowsStartupFolders() *WindowsStartupFolders {
	return &WindowsStartupFolders{BaseWindowsModule{Module: NewModule("windows_startup_folders", "persistence/windows/startup_folders.txt")}}
}

func NewWindowsWmiEventSubscriptions() *WindowsWmiEventSubscriptions {
	return &WindowsWmiEventSubscriptions{BaseWindowsModule{Module: NewModule("windows_wmi_event_subscriptions", "persistence/windows/wmi_event_subscriptions.txt")}}
}

func (m *WindowsScheduledTasks) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	cmd := exec.CommandContext(ctx, "schtasks", "/query", "/fo", "LIST", "/v")
	output, err := cmd.CombinedOutput()
	if err != nil {
		note := fmt.Sprintf("schtasks failed: %v", err)
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

func (m *WindowsServices) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	command := "Get-Service | Select-Object Name,DisplayName,Status,StartType | ConvertTo-Csv -NoTypeInformation"
	return runPowerShellToFile(ctx, command, outputPath, params)
}

func (m *WindowsRunKeys) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	keys := []string{
		"HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run",
		"HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\RunOnce",
		"HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run",
		"HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\RunOnce",
	}

	var combined []byte
	for _, key := range keys {
		cmd := exec.CommandContext(ctx, "reg", "query", key)
		output, err := cmd.CombinedOutput()
		if err != nil {
			combined = append(combined, []byte(fmt.Sprintf("%s: not accessible (%v)\n", key, err))...)
			continue
		}
		combined = append(combined, []byte(fmt.Sprintf("[%s]\n", key))...)
		combined = append(combined, output...)
		combined = append(combined, '\n')
	}

	maxLines, _ := GetMaxLines(params)
	maxSize, _ := GetMaxSizeMB(params)
	combined = LimitOutput(combined, maxLines, maxSize)
	return WriteOutput(outputPath, combined)
}

func (m *WindowsStartupFolders) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	command := "@('AllUsers','CurrentUser') | ForEach-Object {" +
		"if ($_ -eq 'AllUsers') { $p = Join-Path $env:ProgramData 'Microsoft\\Windows\\Start Menu\\Programs\\Startup' }" +
		"else { $p = Join-Path $env:APPDATA 'Microsoft\\Windows\\Start Menu\\Programs\\Startup' }" +
		"Write-Output ('[' + $_ + '] ' + $p);" +
		"if (Test-Path $p) { Get-ChildItem -Path $p -Force | Select-Object Name,FullName,Length,LastWriteTime | ConvertTo-Csv -NoTypeInformation } else { Write-Output 'Not Found' }" +
		"}" 

	return runPowerShellToFile(ctx, command, outputPath, params)
}

func (m *WindowsWmiEventSubscriptions) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	command := "Get-CimInstance -Namespace root\\subscription -Class __EventFilter | Select-Object Name,Query,CreatorSID | ConvertTo-Csv -NoTypeInformation;" +
		"Get-CimInstance -Namespace root\\subscription -Class __EventConsumer | Select-Object Name,CreatorSID | ConvertTo-Csv -NoTypeInformation;" +
		"Get-CimInstance -Namespace root\\subscription -Class __FilterToConsumerBinding | Select-Object Filter,Consumer | ConvertTo-Csv -NoTypeInformation"
	return runPowerShellToFile(ctx, command, outputPath, params)
}
