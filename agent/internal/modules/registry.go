package modules

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/dfir/agent/internal/logging"
)

// ModuleContext provides context for module execution
type ModuleContext struct {
	JobID      string
	IncidentID string
	WorkDir    string
	OS         string
	IsAdmin    bool
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

// HasModule reports whether a module ID is registered.
func HasModule(id string) bool {
	_, exists := moduleRegistry[id]
	return exists
}

// ListModuleIDs returns registered module IDs.
func ListModuleIDs() []string {
	ids := make([]string, 0, len(moduleRegistry))
	for id := range moduleRegistry {
		ids = append(ids, id)
	}
	return ids
}

// Init initializes all modules
func Init() error {
	// Register Windows modules
	Register(NewWindowsEventLogSecurity())
	Register(NewWindowsEventLogSystem())
	Register(NewWindowsEventLogApplication())
	Register(NewWindowsEventLogPowerShellOperational())
	Register(NewWindowsEventLogSysmonOperational())
	Register(NewWindowsProcessList())
	Register(NewWindowsNetworkConnections())
	Register(NewWindowsListeningPorts())
	Register(NewWindowsDnsCache())
	Register(NewWindowsScheduledTasks())
	Register(NewWindowsServices())
	Register(NewWindowsRunKeys())
	Register(NewWindowsStartupFolders())
	Register(NewWindowsWmiEventSubscriptions())
	Register(NewWindowsLocalUsers())
	Register(NewWindowsLoggedOnUsers())
	Register(NewWindowsSystemInfo())
	Register(NewWindowsInstalledPatches())
	Register(NewWindowsTimezone())
	Register(NewWindowsBootTime())

	// Register Linux modules
	Register(NewLinuxProcessList())
	Register(NewLinuxNetworkConnections())
	Register(NewLinuxJournalCtl())
	Register(NewLinuxSyslog())
	Register(NewLinuxAuthLogs())
	Register(NewLinuxWtmp())
	Register(NewLinuxBtmp())
	Register(NewLinuxCron())
	Register(NewLinuxSystemdUnits())
	Register(NewLinuxSystemdTimers())
	Register(NewLinuxRcLocal())
	Register(NewLinuxAuthorizedKeys())
	Register(NewLinuxIpConfig())
	Register(NewLinuxResolvConf())
	Register(NewLinuxBashHistory())
	Register(NewLinuxLoggedInUsers())
	Register(NewLinuxPackages())
	Register(NewLinuxKernelVersion())

	// Register Windows KAPE-like artifact modules
	Register(NewWindowsRegistryHives())
	Register(NewWindowsNtuserDat())
	Register(NewWindowsPrefetch())
	Register(NewWindowsAmcache())
	Register(NewWindowsShimCache())
	Register(NewWindowsLnkFiles())
	Register(NewWindowsJumpLists())
	Register(NewWindowsBrowserChrome())
	Register(NewWindowsBrowserEdge())
	Register(NewWindowsBitsJobs())
	Register(NewWindowsRecycleBin())
	Register(NewWindowsThumbcache())
	Register(NewWindowsShellbags())
	Register(NewWindowsMRU())
	Register(NewWindowsUSBHistory())
	Register(NewWindowsMFTVSS())
	Register(NewWindowsUSNJrnlVSS())

	// Register additional Windows modules (execution history, user activity, Defender, firewall, SRUM)
	Register(NewWindowsPowerShellHistory())
	Register(NewWindowsUserAssist())
	Register(NewWindowsRDPHistory())
	Register(NewWindowsDefenderEvents())
	Register(NewWindowsSRUM())
	Register(NewWindowsScheduledTasksXML())
	Register(NewWindowsFirewallRules())
	Register(NewWindowsFirewallLogs())
	Register(NewWindowsEnvVars())
	Register(NewWindowsBrowserFirefox())
	Register(NewWindowsWMIRepository())
	Register(NewWindowsEventLogTaskScheduler())
	Register(NewWindowsTypedURLs())
	Register(NewWindowsNetworkShares())

	// Register additional Linux modules (credentials, audit, open files, kernel, shell history)
	Register(NewLinuxShadow())
	Register(NewLinuxPasswdGroups())
	Register(NewLinuxSudoers())
	Register(NewLinuxHosts())
	Register(NewLinuxSysctl())
	Register(NewLinuxAuditLog())
	Register(NewLinuxLsof())
	Register(NewLinuxDmesg())
	Register(NewLinuxLsmod())
	Register(NewLinuxZshHistory())
	Register(NewLinuxSshdConfig())
	Register(NewLinuxLdPreload())
	Register(NewLinuxEnvironment())
	Register(NewLinuxPAMConfig())
	Register(NewLinuxContainers())

	logging.Info("Initialized %d modules", len(moduleRegistry))
	return nil
}

// ID returns the module identifier
func (m *Module) ID() string { return m.id }

// Name returns the module name
func (m *Module) Name() string { return m.id }

// OutputRelPath returns the output relative path
func (m *Module) OutputRelPath() string { return m.outputRelPath }

// Module is the base implementation for all modules
type Module struct {
	id            string
	outputRelPath string
}

func NewModule(id string, outputRelPath string) Module {
	return Module{
		id:            id,
		outputRelPath: outputRelPath,
	}
}

// BaseWindowsModule provides Windows-specific functionality
type BaseWindowsModule struct {
	Module
}

// executePowerShell runs a PowerShell command and returns output
func (b *BaseWindowsModule) executePowerShell(ctx context.Context, command string) (string, error) {
	cmd := exec.CommandContext(ctx, "powershell.exe", "-NoProfile", "-Command", command)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("PowerShell command failed: %w", err)
	}
	return string(output), nil
}

// getPowerShellCommand escapes and wraps a command string
func getPowerShellCommand(script string) string {
	return fmt.Sprintf("& { %s }", script)
}

// WarningError indicates a non-fatal module issue.
type WarningError struct {
	msg string
}

func (w WarningError) Error() string { return w.msg }

func NewWarningError(message string) error {
	return WarningError{msg: message}
}

func IsWarning(err error) bool {
	var warning WarningError
	return errors.As(err, &warning)
}

func EnsureOutputDir(outputPath string) error {
	dir := filepath.Dir(outputPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("failed to create output directory %s: %w", dir, err)
	}
	return nil
}

func WriteOutput(outputPath string, content []byte) error {
	if err := EnsureOutputDir(outputPath); err != nil {
		return err
	}
	if err := os.WriteFile(outputPath, content, 0644); err != nil {
		return fmt.Errorf("failed to write output: %w", err)
	}
	return nil
}

func WriteNotFound(outputPath string, message string) error {
	content := fmt.Sprintf("NOT FOUND: %s\n", message)
	return WriteOutput(outputPath, []byte(content))
}

var allowedTimeWindows = map[string]int{
	"1d":  1,
	"3d":  3,
	"7d":  7,
	"14d": 14,
}

var allowedMaxLines = map[int]struct{}{
	500:   {},
	1000:  {},
	5000:  {},
	10000: {},
}

var allowedMaxSizeMB = map[int]struct{}{
	10:  {},
	25:  {},
	50:  {},
	100: {},
}

func AllowedTimeWindow(value string) (int, bool) {
	days, exists := allowedTimeWindows[value]
	return days, exists
}

func IsAllowedMaxLines(value interface{}) bool {
	if v, ok := value.(float64); ok {
		_, exists := allowedMaxLines[int(v)]
		return exists
	}
	if v, ok := value.(int); ok {
		_, exists := allowedMaxLines[v]
		return exists
	}
	return false
}

func IsAllowedMaxSizeMB(value interface{}) bool {
	if v, ok := value.(float64); ok {
		_, exists := allowedMaxSizeMB[int(v)]
		return exists
	}
	if v, ok := value.(int); ok {
		_, exists := allowedMaxSizeMB[v]
		return exists
	}
	return false
}

func GetTimeWindowDays(params map[string]interface{}) int {
	if value, ok := params["time_window"].(string); ok {
		if days, exists := allowedTimeWindows[value]; exists {
			return days
		}
	}
	return allowedTimeWindows["7d"]
}

func GetMaxLines(params map[string]interface{}) (int, bool) {
	value, ok := params["max_lines"]
	if !ok {
		return 0, false
	}
	if v, ok := value.(float64); ok {
		lines := int(v)
		if _, exists := allowedMaxLines[lines]; exists {
			return lines, true
		}
	}
	if v, ok := value.(int); ok {
		if _, exists := allowedMaxLines[v]; exists {
			return v, true
		}
	}
	return 0, false
}

func GetMaxSizeMB(params map[string]interface{}) (int, bool) {
	value, ok := params["max_size_mb"]
	if !ok {
		return 0, false
	}
	if v, ok := value.(float64); ok {
		size := int(v)
		if _, exists := allowedMaxSizeMB[size]; exists {
			return size, true
		}
	}
	if v, ok := value.(int); ok {
		if _, exists := allowedMaxSizeMB[v]; exists {
			return v, true
		}
	}
	return 0, false
}

func LimitOutput(content []byte, maxLines int, maxSizeMB int) []byte {
	if maxSizeMB > 0 {
		limit := maxSizeMB * 1024 * 1024
		if len(content) > limit {
			content = content[:limit]
		}
	}
	if maxLines > 0 {
		lines := strings.Split(string(content), "\n")
		if len(lines) > maxLines {
			lines = lines[:maxLines]
			content = []byte(strings.Join(lines, "\n"))
		}
	}
	return content
}
