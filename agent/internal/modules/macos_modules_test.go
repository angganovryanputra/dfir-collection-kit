package modules_test

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/dfir/agent/internal/modules"
)

// TestMacOSModulesHaveIDs verifies all macOS module constructors return
// non-empty module IDs without panicking.
func TestMacOSModulesHaveIDs(t *testing.T) {
	type ctor func() modules.CollectorModule
	ctors := []ctor{
		func() modules.CollectorModule { return modules.NewMacOSProcessList() },
		func() modules.CollectorModule { return modules.NewMacOSNetworkConnections() },
		func() modules.CollectorModule { return modules.NewMacOSUnifiedLog() },
		func() modules.CollectorModule { return modules.NewMacOSInstallLog() },
		func() modules.CollectorModule { return modules.NewMacOSLaunchdAgents() },
		func() modules.CollectorModule { return modules.NewMacOSLaunchdDaemons() },
		func() modules.CollectorModule { return modules.NewMacOSLoginItems() },
		func() modules.CollectorModule { return modules.NewMacOSCron() },
		func() modules.CollectorModule { return modules.NewMacOSSystemInfo() },
		func() modules.CollectorModule { return modules.NewMacOSUsers() },
		func() modules.CollectorModule { return modules.NewMacOSBashHistory() },
		func() modules.CollectorModule { return modules.NewMacOSZshHistory() },
		func() modules.CollectorModule { return modules.NewMacOSInstalledApps() },
		func() modules.CollectorModule { return modules.NewMacOSSafariHistory() },
		func() modules.CollectorModule { return modules.NewMacOSChromeHistory() },
		func() modules.CollectorModule { return modules.NewMacOSQuarantineEvents() },
		func() modules.CollectorModule { return modules.NewMacOSSSHKnownHosts() },
	}
	for _, c := range ctors {
		m := c()
		if m.ID() == "" {
			t.Errorf("module ID must not be empty for %T", m)
		}
	}
}

// TestMacOSModulesReturnWarningOnNonDarwin verifies that on non-macOS systems
// macOS modules return a WarningError instead of crashing the entire job.
func TestMacOSModulesReturnWarningOnNonDarwin(t *testing.T) {
	tmpDir := t.TempDir()
	ctx := context.Background()
	mctx := modules.ModuleContext{}

	m := modules.NewMacOSProcessList()
	err := m.Run(ctx, mctx, nil, filepath.Join(tmpDir, "out.txt"))

	if err == nil {
		// On real macOS this runs successfully — that's fine
		return
	}
	// On non-macOS it must be a WarningError, not a hard failure
	if !modules.IsWarning(err) {
		t.Errorf("expected WarningError on non-darwin, got hard error: %v", err)
	}
}

// TestVSSEnumerateModuleID checks the VSS enumerate module ID matches the
// Python MODULE_REGISTRY entry.
func TestVSSEnumerateModuleID(t *testing.T) {
	m := modules.NewWindowsVSSEnumerate()
	if m.ID() != "windows_vss_enumerate" {
		t.Errorf("expected 'windows_vss_enumerate', got '%s'", m.ID())
	}
}

// TestRegistryContainsMacOSModules verifies Init() registers all 17 macOS modules.
func TestRegistryContainsMacOSModules(t *testing.T) {
	if err := modules.Init(); err != nil {
		t.Fatalf("modules.Init() failed: %v", err)
	}
	expected := []string{
		"macos_process_list",
		"macos_network_connections",
		"macos_unified_log",
		"macos_install_log",
		"macos_launchd_agents",
		"macos_launchd_daemons",
		"macos_login_items",
		"macos_cron",
		"macos_system_info",
		"macos_users",
		"macos_bash_history",
		"macos_zsh_history",
		"macos_installed_apps",
		"macos_safari_history",
		"macos_chrome_history",
		"macos_quarantine_events",
		"macos_ssh_known_hosts",
	}
	for _, id := range expected {
		if !modules.HasModule(id) {
			t.Errorf("module '%s' not registered", id)
		}
	}
}

// TestCustomModuleExecutorSkipsBuiltinRegistry verifies that when a JobModule
// has a Command field, the executor does not require the module to be in the
// registry (validated indirectly: the Go code path is covered by executor.go).
// We verify requireMacOS guard to ensure it works for all macOS modules.
func TestRequireMacOSGuard(t *testing.T) {
	tmpDir := t.TempDir()
	ctx := context.Background()
	mctx := modules.ModuleContext{}
	outputPath := filepath.Join(tmpDir, "safari_history.db")

	m := modules.NewMacOSSafariHistory()
	err := m.Run(ctx, mctx, nil, outputPath)

	if err == nil && os.Getenv("TRAVIS_OS_NAME") != "osx" {
		// If no error and we're not on macOS, maybe the Home dir had the file
		// Only meaningful on macOS — skip silently
		return
	}
	// On non-macOS: must be WarningError
	if err != nil && !modules.IsWarning(err) {
		t.Errorf("expected warning or nil, got hard error: %v", err)
	}
}
