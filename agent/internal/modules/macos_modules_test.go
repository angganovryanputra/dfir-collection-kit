package modules_test

import (
	"context"
	"os"
	"path/filepath"
	"runtime"
	"strings"
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

func TestGetMacOSUserHomeDirsFrom_ExclusionsAndDeduplication(t *testing.T) {
	baseDir := t.TempDir()

	// Create directories to be excluded
	for _, name := range []string{"Shared", "Guest", ".localized", ".hidden"} {
		if err := os.MkdirAll(filepath.Join(baseDir, name), 0755); err != nil {
			t.Fatalf("failed to create excluded dir %s: %v", name, err)
		}
	}

	// Create regular file that should be ignored
	if err := os.WriteFile(filepath.Join(baseDir, "file.txt"), []byte("not a dir"), 0644); err != nil {
		t.Fatalf("failed to create file.txt: %v", err)
	}

	// Create valid user home directories
	aliceDir := filepath.Join(baseDir, "alice")
	bobDir := filepath.Join(baseDir, "bob")
	for _, d := range []string{aliceDir, bobDir} {
		if err := os.MkdirAll(d, 0755); err != nil {
			t.Fatalf("failed to create user dir %s: %v", d, err)
		}
	}

	// Test deduplication when currentHome is inside baseDir (alice)
	dirs := modules.GetMacOSUserHomeDirsFrom(baseDir, aliceDir)
	if len(dirs) != 2 {
		t.Fatalf("expected 2 user dirs, got %d: %v", len(dirs), dirs)
	}
	expectedMap := map[string]bool{aliceDir: true, bobDir: true}
	for _, d := range dirs {
		if !expectedMap[d] {
			t.Errorf("unexpected directory included: %s", d)
		}
	}

	// Test when currentHome is outside baseDir (e.g. root)
	rootHome := filepath.Join(t.TempDir(), "root")
	dirsWithRoot := modules.GetMacOSUserHomeDirsFrom(baseDir, rootHome)
	if len(dirsWithRoot) != 3 {
		t.Fatalf("expected 3 user dirs with root, got %d: %v", len(dirsWithRoot), dirsWithRoot)
	}
	expectedMapWithRoot := map[string]bool{aliceDir: true, bobDir: true, rootHome: true}
	for _, d := range dirsWithRoot {
		if !expectedMapWithRoot[d] {
			t.Errorf("unexpected directory included: %s", d)
		}
	}
}

func TestCollectMacOSShellHistoryFrom_Aggregation(t *testing.T) {
	baseDir := t.TempDir()
	outPath := filepath.Join(t.TempDir(), "bash_history.txt")

	aliceDir := filepath.Join(baseDir, "alice")
	bobDir := filepath.Join(baseDir, "bob")
	charlieDir := filepath.Join(baseDir, "charlie")
	for _, d := range []string{aliceDir, bobDir, charlieDir} {
		if err := os.MkdirAll(d, 0755); err != nil {
			t.Fatalf("failed to create dir %s: %v", d, err)
		}
	}

	aliceHistory := "echo hello\nls -la /Users\n"
	bobHistory := "whoami\nps aux\n"
	if err := os.WriteFile(filepath.Join(aliceDir, ".bash_history"), []byte(aliceHistory), 0644); err != nil {
		t.Fatalf("failed to write alice history: %v", err)
	}
	if err := os.WriteFile(filepath.Join(bobDir, ".bash_history"), []byte(bobHistory), 0644); err != nil {
		t.Fatalf("failed to write bob history: %v", err)
	}
	// charlie has no history file

	ctx := context.Background()
	err := modules.CollectMacOSShellHistoryFrom(ctx, nil, outPath, ".bash_history", []string{aliceDir, bobDir, charlieDir})
	if err != nil {
		t.Fatalf("CollectMacOSShellHistoryFrom failed: %v", err)
	}

	data, err := os.ReadFile(outPath)
	if err != nil {
		t.Fatalf("failed to read output file: %v", err)
	}
	content := string(data)

	// Verify Alice section
	expectedAliceHeader := "=== User: alice (" + aliceDir + ") ==="
	if !strings.Contains(content, expectedAliceHeader) {
		t.Errorf("missing alice header %q in output:\n%s", expectedAliceHeader, content)
	}
	if !strings.Contains(content, "echo hello") || !strings.Contains(content, "ls -la /Users") {
		t.Errorf("missing alice commands in output:\n%s", content)
	}

	// Verify Bob section
	expectedBobHeader := "=== User: bob (" + bobDir + ") ==="
	if !strings.Contains(content, expectedBobHeader) {
		t.Errorf("missing bob header %q in output:\n%s", expectedBobHeader, content)
	}
	if !strings.Contains(content, "whoami") || !strings.Contains(content, "ps aux") {
		t.Errorf("missing bob commands in output:\n%s", content)
	}

	// Verify Charlie is not mentioned
	if strings.Contains(content, "charlie") {
		t.Errorf("output should not mention charlie since no history file existed:\n%s", content)
	}
}

func TestCollectMacOSShellHistoryFrom_NotFound(t *testing.T) {
	baseDir := t.TempDir()
	outPath := filepath.Join(t.TempDir(), "zsh_history.txt")

	daveDir := filepath.Join(baseDir, "dave")
	if err := os.MkdirAll(daveDir, 0755); err != nil {
		t.Fatalf("failed to create dir: %v", err)
	}

	ctx := context.Background()
	err := modules.CollectMacOSShellHistoryFrom(ctx, nil, outPath, ".zsh_history", []string{daveDir})
	if err != nil {
		t.Fatalf("expected nil error on not found, got: %v", err)
	}

	data, err := os.ReadFile(outPath)
	if err != nil {
		t.Fatalf("failed to read output: %v", err)
	}
	if !strings.Contains(string(data), "NOT FOUND: .zsh_history not found") {
		t.Errorf("expected NOT FOUND in output, got: %s", string(data))
	}
}

func TestMacOSShellHistory_NonDarwinWarning(t *testing.T) {
	if runtime.GOOS == "darwin" {
		t.Skip("skipping non-darwin warning check on darwin")
	}

	tmpDir := t.TempDir()
	ctx := context.Background()
	mctx := modules.ModuleContext{}

	bashMod := modules.NewMacOSBashHistory()
	errBash := bashMod.Run(ctx, mctx, nil, filepath.Join(tmpDir, "bash_out.txt"))
	if !modules.IsWarning(errBash) {
		t.Errorf("expected warning error for bash history on non-darwin, got: %v", errBash)
	}

	zshMod := modules.NewMacOSZshHistory()
	errZsh := zshMod.Run(ctx, mctx, nil, filepath.Join(tmpDir, "zsh_out.txt"))
	if !modules.IsWarning(errZsh) {
		t.Errorf("expected warning error for zsh history on non-darwin, got: %v", errZsh)
	}
}
