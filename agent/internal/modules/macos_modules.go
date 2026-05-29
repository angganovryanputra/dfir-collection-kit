// Package modules — macOS collection modules using standard system tools.
// Each module requires the agent to run with appropriate privileges.
// Unified Log collection requires Full Disk Access entitlement.
package modules

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
)

// requireMacOS returns a warning error if the current OS is not darwin.
func requireMacOS(moduleName string) error {
	if runtime.GOOS != "darwin" {
		return NewWarningError(fmt.Sprintf("%s: only supported on macOS", moduleName))
	}
	return nil
}

// runMacOSCmd runs a command and writes its combined output to outputPath.
func runMacOSCmd(ctx context.Context, outputPath string, name string, args ...string) error {
	if err := os.MkdirAll(filepath.Dir(outputPath), 0755); err != nil {
		return fmt.Errorf("mkdir failed: %w", err)
	}
	cmd := exec.CommandContext(ctx, name, args...)
	out, err := cmd.CombinedOutput()
	if err != nil {
		note := fmt.Sprintf("command failed: %v\n%s", err, strings.TrimSpace(string(out)))
		_ = WriteNotFound(outputPath, note)
		return NewWarningError(note)
	}
	if writeErr := os.WriteFile(outputPath, out, 0644); writeErr != nil {
		return fmt.Errorf("write failed: %w", writeErr)
	}
	return nil
}

// ── Volatile ──────────────────────────────────────────────────────────────────

type MacOSProcessList struct{ Module }

func NewMacOSProcessList() *MacOSProcessList {
	return &MacOSProcessList{NewModule("macos_process_list", "volatile/macos/process_list.txt")}
}
func (m *MacOSProcessList) Run(ctx context.Context, _ ModuleContext, _ map[string]interface{}, out string) error {
	if err := requireMacOS("macos_process_list"); err != nil {
		return err
	}
	return runMacOSCmd(ctx, out, "ps", "auxwww")
}

type MacOSNetworkConnections struct{ Module }

func NewMacOSNetworkConnections() *MacOSNetworkConnections {
	return &MacOSNetworkConnections{NewModule("macos_network_connections", "volatile/macos/network_connections.txt")}
}
func (m *MacOSNetworkConnections) Run(ctx context.Context, _ ModuleContext, _ map[string]interface{}, out string) error {
	if err := requireMacOS("macos_network_connections"); err != nil {
		return err
	}
	return runMacOSCmd(ctx, out, "lsof", "-i", "-n", "-P")
}

// ── Logs ──────────────────────────────────────────────────────────────────────

type MacOSUnifiedLog struct{ Module }

func NewMacOSUnifiedLog() *MacOSUnifiedLog {
	return &MacOSUnifiedLog{NewModule("macos_unified_log", "logs/macos/unified_log.txt")}
}
func (m *MacOSUnifiedLog) Run(ctx context.Context, _ ModuleContext, params map[string]interface{}, out string) error {
	if err := requireMacOS("macos_unified_log"); err != nil {
		return err
	}
	days := GetTimeWindowDays(params)
	predicate := fmt.Sprintf("timestamp >= -%dd", days)
	return runMacOSCmd(ctx, out, "log", "show", "--predicate", predicate, "--info")
}

type MacOSInstallLog struct{ Module }

func NewMacOSInstallLog() *MacOSInstallLog {
	return &MacOSInstallLog{NewModule("macos_install_log", "logs/macos/install.log")}
}
func (m *MacOSInstallLog) Run(ctx context.Context, _ ModuleContext, _ map[string]interface{}, out string) error {
	if err := requireMacOS("macos_install_log"); err != nil {
		return err
	}
	src := "/var/log/install.log"
	if _, err := os.Stat(src); err != nil {
		_ = WriteNotFound(out, "install.log not found")
		return nil
	}
	if err := os.MkdirAll(filepath.Dir(out), 0755); err != nil {
		return fmt.Errorf("mkdir failed: %w", err)
	}
	return CopyFileNativeBackup(ctx, src, out)
}

// ── Persistence ───────────────────────────────────────────────────────────────

type MacOSLaunchdAgents struct{ Module }

func NewMacOSLaunchdAgents() *MacOSLaunchdAgents {
	return &MacOSLaunchdAgents{NewModule("macos_launchd_agents", "persistence/macos/launchd_agents.txt")}
}
func (m *MacOSLaunchdAgents) Run(ctx context.Context, _ ModuleContext, _ map[string]interface{}, out string) error {
	if err := requireMacOS("macos_launchd_agents"); err != nil {
		return err
	}
	return runMacOSCmd(ctx, out, "launchctl", "list")
}

type MacOSLaunchdDaemons struct{ Module }

func NewMacOSLaunchdDaemons() *MacOSLaunchdDaemons {
	return &MacOSLaunchdDaemons{NewModule("macos_launchd_daemons", "persistence/macos/launchd_daemons.txt")}
}
func (m *MacOSLaunchdDaemons) Run(ctx context.Context, _ ModuleContext, _ map[string]interface{}, out string) error {
	if err := requireMacOS("macos_launchd_daemons"); err != nil {
		return err
	}
	return runMacOSCmd(ctx, out, "launchctl", "print", "system")
}

type MacOSLoginItems struct{ Module }

func NewMacOSLoginItems() *MacOSLoginItems {
	return &MacOSLoginItems{NewModule("macos_login_items", "persistence/macos/login_items.txt")}
}
func (m *MacOSLoginItems) Run(ctx context.Context, _ ModuleContext, _ map[string]interface{}, out string) error {
	if err := requireMacOS("macos_login_items"); err != nil {
		return err
	}
	// Use sfltool to list login items (works without Full Disk Access)
	return runMacOSCmd(ctx, out, "sfltool", "dumpbtm")
}

type MacOSCron struct{ Module }

func NewMacOSCron() *MacOSCron {
	return &MacOSCron{NewModule("macos_cron", "persistence/macos/cron.txt")}
}
func (m *MacOSCron) Run(ctx context.Context, _ ModuleContext, _ map[string]interface{}, out string) error {
	if err := requireMacOS("macos_cron"); err != nil {
		return err
	}
	return runMacOSCmd(ctx, out, "crontab", "-l")
}

// ── System ────────────────────────────────────────────────────────────────────

type MacOSSystemInfo struct{ Module }

func NewMacOSSystemInfo() *MacOSSystemInfo {
	return &MacOSSystemInfo{NewModule("macos_system_info", "system/macos/system_info.txt")}
}
func (m *MacOSSystemInfo) Run(ctx context.Context, _ ModuleContext, _ map[string]interface{}, out string) error {
	if err := requireMacOS("macos_system_info"); err != nil {
		return err
	}
	return runMacOSCmd(ctx, out, "system_profiler", "SPSoftwareDataType", "SPHardwareDataType")
}

type MacOSUsers struct{ Module }

func NewMacOSUsers() *MacOSUsers {
	return &MacOSUsers{NewModule("macos_users", "system/macos/users.txt")}
}
func (m *MacOSUsers) Run(ctx context.Context, _ ModuleContext, _ map[string]interface{}, out string) error {
	if err := requireMacOS("macos_users"); err != nil {
		return err
	}
	return runMacOSCmd(ctx, out, "dscl", ".", "list", "/Users")
}

type MacOSBashHistory struct{ Module }

func NewMacOSBashHistory() *MacOSBashHistory {
	return &MacOSBashHistory{NewModule("macos_bash_history", "system/macos/bash_history.txt")}
}
func (m *MacOSBashHistory) Run(ctx context.Context, _ ModuleContext, _ map[string]interface{}, out string) error {
	if err := requireMacOS("macos_bash_history"); err != nil {
		return err
	}
	homeDir, _ := os.UserHomeDir()
	src := filepath.Join(homeDir, ".bash_history")
	if _, statErr := os.Stat(src); statErr != nil {
		_ = WriteNotFound(out, ".bash_history not found")
		return nil
	}
	if mkdirErr := os.MkdirAll(filepath.Dir(out), 0755); mkdirErr != nil {
		return fmt.Errorf("mkdir failed: %w", mkdirErr)
	}
	return CopyFileNativeBackup(ctx, src, out)
}

type MacOSZshHistory struct{ Module }

func NewMacOSZshHistory() *MacOSZshHistory {
	return &MacOSZshHistory{NewModule("macos_zsh_history", "system/macos/zsh_history.txt")}
}
func (m *MacOSZshHistory) Run(ctx context.Context, _ ModuleContext, _ map[string]interface{}, out string) error {
	if err := requireMacOS("macos_zsh_history"); err != nil {
		return err
	}
	homeDir, _ := os.UserHomeDir()
	src := filepath.Join(homeDir, ".zsh_history")
	if _, statErr := os.Stat(src); statErr != nil {
		_ = WriteNotFound(out, ".zsh_history not found")
		return nil
	}
	if mkdirErr := os.MkdirAll(filepath.Dir(out), 0755); mkdirErr != nil {
		return fmt.Errorf("mkdir failed: %w", mkdirErr)
	}
	return CopyFileNativeBackup(ctx, src, out)
}

type MacOSInstalledApps struct{ Module }

func NewMacOSInstalledApps() *MacOSInstalledApps {
	return &MacOSInstalledApps{NewModule("macos_installed_apps", "system/macos/installed_apps.txt")}
}
func (m *MacOSInstalledApps) Run(ctx context.Context, _ ModuleContext, _ map[string]interface{}, out string) error {
	if err := requireMacOS("macos_installed_apps"); err != nil {
		return err
	}
	return runMacOSCmd(ctx, out, "system_profiler", "SPApplicationsDataType")
}

// ── Artifacts ─────────────────────────────────────────────────────────────────

type MacOSSafariHistory struct{ Module }

func NewMacOSSafariHistory() *MacOSSafariHistory {
	return &MacOSSafariHistory{NewModule("macos_safari_history", "artifacts/macos/safari/History.db")}
}
func (m *MacOSSafariHistory) Run(ctx context.Context, _ ModuleContext, _ map[string]interface{}, out string) error {
	if err := requireMacOS("macos_safari_history"); err != nil {
		return err
	}
	homeDir, _ := os.UserHomeDir()
	src := filepath.Join(homeDir, "Library", "Safari", "History.db")
	if _, statErr := os.Stat(src); statErr != nil {
		_ = WriteNotFound(out, "Safari History.db not found (requires Full Disk Access)")
		return NewWarningError("macos_safari_history: requires Full Disk Access")
	}
	if mkdirErr := os.MkdirAll(filepath.Dir(out), 0755); mkdirErr != nil {
		return fmt.Errorf("mkdir failed: %w", mkdirErr)
	}
	return CopyFileNativeBackup(ctx, src, out)
}

type MacOSChromeHistory struct{ Module }

func NewMacOSChromeHistory() *MacOSChromeHistory {
	return &MacOSChromeHistory{NewModule("macos_chrome_history", "artifacts/macos/chrome/")}
}
func (m *MacOSChromeHistory) Run(ctx context.Context, _ ModuleContext, _ map[string]interface{}, out string) error {
	if err := requireMacOS("macos_chrome_history"); err != nil {
		return err
	}
	homeDir, _ := os.UserHomeDir()
	chromeDir := filepath.Join(homeDir, "Library", "Application Support", "Google", "Chrome", "Default")
	if mkdirErr := os.MkdirAll(out, 0755); mkdirErr != nil {
		return fmt.Errorf("mkdir failed: %w", mkdirErr)
	}
	for _, artifact := range []string{"History", "Cookies", "Login Data"} {
		src := filepath.Join(chromeDir, artifact)
		if _, statErr := os.Stat(src); statErr == nil {
			_ = CopyFileNativeBackup(ctx, src, filepath.Join(out, artifact))
		}
	}
	return nil
}

type MacOSQuarantineEvents struct{ Module }

func NewMacOSQuarantineEvents() *MacOSQuarantineEvents {
	return &MacOSQuarantineEvents{NewModule("macos_quarantine_events", "artifacts/macos/quarantine_events.db")}
}
func (m *MacOSQuarantineEvents) Run(ctx context.Context, _ ModuleContext, _ map[string]interface{}, out string) error {
	if err := requireMacOS("macos_quarantine_events"); err != nil {
		return err
	}
	homeDir, _ := os.UserHomeDir()
	src := filepath.Join(homeDir, "Library", "Preferences", "com.apple.LaunchServices.QuarantineEventsV2")
	if _, statErr := os.Stat(src); statErr != nil {
		_ = WriteNotFound(out, "QuarantineEventsV2 not found")
		return nil
	}
	if mkdirErr := os.MkdirAll(filepath.Dir(out), 0755); mkdirErr != nil {
		return fmt.Errorf("mkdir failed: %w", mkdirErr)
	}
	return CopyFileNativeBackup(ctx, src, out)
}

type MacOSSSHKnownHosts struct{ Module }

func NewMacOSSSHKnownHosts() *MacOSSSHKnownHosts {
	return &MacOSSSHKnownHosts{NewModule("macos_ssh_known_hosts", "artifacts/macos/ssh_known_hosts.txt")}
}
func (m *MacOSSSHKnownHosts) Run(ctx context.Context, _ ModuleContext, _ map[string]interface{}, out string) error {
	if err := requireMacOS("macos_ssh_known_hosts"); err != nil {
		return err
	}
	homeDir, _ := os.UserHomeDir()
	src := filepath.Join(homeDir, ".ssh", "known_hosts")
	if _, statErr := os.Stat(src); statErr != nil {
		_ = WriteNotFound(out, "~/.ssh/known_hosts not found")
		return nil
	}
	if mkdirErr := os.MkdirAll(filepath.Dir(out), 0755); mkdirErr != nil {
		return fmt.Errorf("mkdir failed: %w", mkdirErr)
	}
	return CopyFileNativeBackup(ctx, src, out)
}
