package modules

import (
	"context"
	"fmt"
	"os/exec"
)

type WindowsProcessList struct {
	BaseWindowsModule
}

type WindowsNetworkConnections struct {
	BaseWindowsModule
}

type WindowsListeningPorts struct {
	BaseWindowsModule
}

type WindowsDnsCache struct {
	BaseWindowsModule
}

func NewWindowsProcessList() *WindowsProcessList {
	return &WindowsProcessList{BaseWindowsModule{Module: NewModule("windows_process_list", "volatile/windows/process_list.csv")}}
}

func NewWindowsNetworkConnections() *WindowsNetworkConnections {
	return &WindowsNetworkConnections{BaseWindowsModule{Module: NewModule("windows_network_connections", "volatile/windows/network_connections.csv")}}
}

func NewWindowsListeningPorts() *WindowsListeningPorts {
	return &WindowsListeningPorts{BaseWindowsModule{Module: NewModule("windows_listening_ports", "volatile/windows/listening_ports.csv")}}
}

func NewWindowsDnsCache() *WindowsDnsCache {
	return &WindowsDnsCache{BaseWindowsModule{Module: NewModule("windows_dns_cache", "volatile/windows/dns_cache.txt")}}
}

func (m *WindowsProcessList) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	command := "Get-Process | Select-Object Id,ProcessName,CPU,WorkingSet,VirtualMemorySize,Path | ConvertTo-Csv -NoTypeInformation"
	return runPowerShellToFile(ctx, command, outputPath, params)
}

func (m *WindowsNetworkConnections) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	command := "Get-NetTCPConnection -State Established | Select-Object LocalAddress,LocalPort,RemoteAddress,RemotePort,State,OwningProcess | ConvertTo-Csv -NoTypeInformation"
	return runPowerShellToFile(ctx, command, outputPath, params)
}

func (m *WindowsListeningPorts) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	command := "Get-NetTCPConnection -State Listen | Select-Object LocalAddress,LocalPort,State,OwningProcess | ConvertTo-Csv -NoTypeInformation"
	return runPowerShellToFile(ctx, command, outputPath, params)
}

func (m *WindowsDnsCache) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	cmd := exec.CommandContext(ctx, "ipconfig", "/displaydns")
	output, err := cmd.CombinedOutput()
	if err != nil {
		note := fmt.Sprintf("ipconfig failed: %v", err)
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

func runPowerShellToFile(ctx context.Context, command string, outputPath string, params map[string]interface{}) error {
	output, err := (&BaseWindowsModule{}).executePowerShell(ctx, getPowerShellCommand(command))
	if err != nil {
		note := fmt.Sprintf("PowerShell failed: %v", err)
		if writeErr := WriteNotFound(outputPath, note); writeErr != nil {
			return writeErr
		}
		return NewWarningError(note)
	}
	maxLines, _ := GetMaxLines(params)
	maxSize, _ := GetMaxSizeMB(params)
	outBytes := LimitOutput([]byte(output), maxLines, maxSize)
	return WriteOutput(outputPath, outBytes)
}
