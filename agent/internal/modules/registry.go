package modules

import (
	"context"
	"fmt"
	"os/exec"
	"path/filepath"
	"runtime"

	"github.com/dfir/agent/internal/logging"
)

// ModuleContext provides context for module execution
type ModuleContext struct {
	JobID      string
	IncidentID string
	WorkDir    string
	OS         string
}

// CollectorModule defines the interface for all collection modules
type CollectorModule interface {
	ID() string
	Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error
}

var (
	moduleRegistry = make(map[string]CollectorModule)
)

// Register registers a module implementation
func Register(module CollectorModule) {
	moduleRegistry[module.ID()] = module
	logging.Info("Module registered: %s", module.ID())
}

// GetModule retrieves a registered module by ID
func GetModule(id string) (CollectorModule, error) {
	module, exists := moduleRegistry[id]
	if !exists {
		return nil, fmt.Errorf("module not found: %s", id)
	}
	return module, nil
}

// Init initializes all modules
func Init() error {
	// Register Windows modules
	Register(&WindowsEventLogsSecurity{})
	Register(&WindowsEventLogsSystem{})
	Register(&WindowsEventLogsPowerShell{})
	Register(&WindowsProcessList{})
	Register(&WindowsNetworkConnections{})
	Register(&WindowsScheduledTasks{})
	Register(&WindowsAutorunsBasic{})

	// Register Linux modules
	Register(&LinuxProcessList{})
	Register(&LinuxNetworkConnections{})
	Register(&LinuxSyslogRecent{})
	Register(&LinuxAuthLogs{})
	Register(&LinuxCronJobs{})
	Register(&LinuxLoggedInUsers{})

	logging.Info("Initialized %d modules", len(moduleRegistry))
	return nil
}

// ID returns the module identifier
func (m *Module) ID() string { return m.id }

// Name returns the module name
func (m *Module) Name() string { return m.id }

// OutputRelPath returns the output relative path
func (m *Module) OutputRelPath() string { return m.outputRelPath }

// Params returns the module parameters
func (m *Module) Params() map[string]interface{} { return m.params }

// Module is the base implementation for all modules
type Module struct {
	id          string
	outputRelPath string
}

// BaseWindowsModule provides Windows-specific functionality
type BaseWindowsModule struct {
	Module
}

// executePowerShell runs a PowerShell command and returns output
func (b *BaseWindowsModule) executePowerShell(ctx context.Context, command string) (string, error) {
	cmd := exec.CommandContext(ctx, "powershell.exe", "-NoProfile", "-Command", command)
	if output, err := cmd.CombinedOutput(); err != nil {
		return "", fmt.Errorf("PowerShell command failed: %w", err)
	}
	return output, nil
}

// getPowerShellCommand escapes and wraps a command string
func getPowerShellCommand(script string) string {
	return fmt.Sprintf("& { %s }", script)
}
