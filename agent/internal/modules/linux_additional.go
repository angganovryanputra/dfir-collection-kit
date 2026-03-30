// Package modules — additional Linux forensic artifact collection modules.
// These modules extend the base Linux collection with credential files,
// audit logs, open file tracking, kernel state, and shell history.
package modules

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
)

// ── /etc/shadow ───────────────────────────────────────────────────────────────
// Copies /etc/shadow which contains hashed passwords for all local accounts.
// Essential for credential analysis. Requires root.

type LinuxShadow struct{ Module }

func NewLinuxShadow() *LinuxShadow {
	return &LinuxShadow{Module: NewModule("linux_shadow", "system/linux/shadow.txt")}
}

func (m *LinuxShadow) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	return copyIfExists(outputPath, "/etc/shadow")
}

// ── /etc/passwd + /etc/group ──────────────────────────────────────────────────
// Collects user account and group definitions.
// Useful for identifying newly created accounts or unusual UID 0 entries.

type LinuxPasswdGroups struct{ Module }

func NewLinuxPasswdGroups() *LinuxPasswdGroups {
	return &LinuxPasswdGroups{Module: NewModule("linux_passwd_groups", "system/linux/passwd_groups.txt")}
}

func (m *LinuxPasswdGroups) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	var combined []byte
	for _, src := range []string{"/etc/passwd", "/etc/group", "/etc/gshadow"} {
		data, err := os.ReadFile(src)
		if err != nil {
			continue
		}
		combined = append(combined, formatMultiFileContent("file", src, data)...)
		combined = addSeparator(combined)
	}
	if len(combined) == 0 {
		return WriteNotFound(outputPath, "/etc/passwd and /etc/group not readable")
	}
	maxLines, _ := GetMaxLines(params)
	maxSize, _ := GetMaxSizeMB(params)
	combined = LimitOutput(combined, maxLines, maxSize)
	return WriteOutput(outputPath, combined)
}

// ── /etc/sudoers ──────────────────────────────────────────────────────────────
// Copies the sudoers file and all drop-in files from /etc/sudoers.d/.
// Attackers commonly add entries here for privilege escalation persistence.

type LinuxSudoers struct{ Module }

func NewLinuxSudoers() *LinuxSudoers {
	return &LinuxSudoers{Module: NewModule("linux_sudoers", "system/linux/sudoers.txt")}
}

func (m *LinuxSudoers) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	var combined []byte

	if data, err := os.ReadFile("/etc/sudoers"); err == nil {
		combined = append(combined, formatMultiFileContent("file", "/etc/sudoers", data)...)
		combined = addSeparator(combined)
	}

	entries, _ := os.ReadDir("/etc/sudoers.d")
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		path := filepath.Join("/etc/sudoers.d", entry.Name())
		if data, err := os.ReadFile(path); err == nil {
			combined = append(combined, formatMultiFileContent("file", path, data)...)
			combined = addSeparator(combined)
		}
	}

	if len(combined) == 0 {
		if writeErr := WriteNotFound(outputPath, "sudoers not readable"); writeErr != nil {
			return writeErr
		}
		return NewWarningError("sudoers not readable (requires root)")
	}
	maxLines, _ := GetMaxLines(params)
	maxSize, _ := GetMaxSizeMB(params)
	combined = LimitOutput(combined, maxLines, maxSize)
	return WriteOutput(outputPath, combined)
}

// ── /etc/hosts + /etc/hostname ────────────────────────────────────────────────
// Collects host name resolution files. Attackers modify /etc/hosts to
// redirect traffic or disable security tools.

type LinuxHosts struct{ Module }

func NewLinuxHosts() *LinuxHosts {
	return &LinuxHosts{Module: NewModule("linux_hosts", "system/linux/hosts.txt")}
}

func (m *LinuxHosts) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	var combined []byte
	for _, src := range []string{"/etc/hosts", "/etc/hostname", "/etc/hosts.allow", "/etc/hosts.deny"} {
		if data, err := os.ReadFile(src); err == nil {
			combined = append(combined, formatMultiFileContent("file", src, data)...)
			combined = addSeparator(combined)
		}
	}
	if len(combined) == 0 {
		return WriteNotFound(outputPath, "/etc/hosts not found")
	}
	return WriteOutput(outputPath, combined)
}

// ── sysctl (kernel parameters) ────────────────────────────────────────────────
// Dumps all kernel parameters via sysctl -a.
// Useful for detecting attackers who disable security features (e.g., dmesg_restrict,
// perf_event_paranoid) or enable IP forwarding for pivoting.

type LinuxSysctl struct{ Module }

func NewLinuxSysctl() *LinuxSysctl {
	return &LinuxSysctl{Module: NewModule("linux_sysctl", "system/linux/sysctl.txt")}
}

func (m *LinuxSysctl) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	if _, err := exec.LookPath("sysctl"); err != nil {
		note := "sysctl not available"
		if writeErr := WriteNotFound(outputPath, note); writeErr != nil {
			return writeErr
		}
		return NewWarningError(note)
	}
	return runCommandToFile(ctx, outputPath, params, "sysctl", "-a", "--ignore")
}

// ── /var/log/audit/audit.log ─────────────────────────────────────────────────
// Collects the Linux Audit daemon log which records syscalls, file access,
// privilege use, and authentication events. Requires auditd running and root access.

type LinuxAuditLog struct{ Module }

func NewLinuxAuditLog() *LinuxAuditLog {
	return &LinuxAuditLog{Module: NewModule("linux_audit_log", "logs/linux/audit.log")}
}

func (m *LinuxAuditLog) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	// Try current log first, then rotated logs
	auditPaths := []string{
		"/var/log/audit/audit.log",
		"/var/log/audit.log",
	}
	data, srcPath, err := readFirstExisting(auditPaths)
	if err != nil {
		if writeErr := WriteNotFound(outputPath, "audit.log not found (auditd may not be running)"); writeErr != nil {
			return writeErr
		}
		return NewWarningError("audit.log not found")
	}
	maxLines, _ := GetMaxLines(params)
	maxSize, _ := GetMaxSizeMB(params)
	data = LimitOutput(data, maxLines, maxSize)
	_ = srcPath
	return WriteOutput(outputPath, data)
}

// ── lsof (open files and network connections) ─────────────────────────────────
// Lists all open files and network connections. More comprehensive than ss/netstat
// as it includes file descriptors, pipes, Unix sockets, and process information.

type LinuxLsof struct{ Module }

func NewLinuxLsof() *LinuxLsof {
	return &LinuxLsof{Module: NewModule("linux_lsof", "volatile/linux/lsof.txt")}
}

func (m *LinuxLsof) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	if _, err := exec.LookPath("lsof"); err != nil {
		note := "lsof not available"
		if writeErr := WriteNotFound(outputPath, note); writeErr != nil {
			return writeErr
		}
		return NewWarningError(note)
	}
	// -n: no hostname resolution (faster), -P: no port name resolution, -i: network files
	return runCommandToFile(ctx, outputPath, params, "lsof", "-nP", "-i")
}

// ── dmesg (kernel ring buffer) ────────────────────────────────────────────────
// Collects kernel messages. Useful for detecting kernel module loads,
// USB device insertions, OOM kills, and hardware-related attacker activity.

type LinuxDmesg struct{ Module }

func NewLinuxDmesg() *LinuxDmesg {
	return &LinuxDmesg{Module: NewModule("linux_dmesg", "logs/linux/dmesg.txt")}
}

func (m *LinuxDmesg) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	if _, err := exec.LookPath("dmesg"); err != nil {
		note := "dmesg not available"
		if writeErr := WriteNotFound(outputPath, note); writeErr != nil {
			return writeErr
		}
		return NewWarningError(note)
	}
	// -T: human-readable timestamps, --level: all severity levels
	cmd := exec.CommandContext(ctx, "dmesg", "-T", "--level=emerg,alert,crit,err,warn,notice,info")
	output, err := cmd.CombinedOutput()
	if err != nil {
		// dmesg -T may fail on older kernels; retry without flags
		cmd2 := exec.CommandContext(ctx, "dmesg")
		output, err = cmd2.CombinedOutput()
		if err != nil {
			return fmt.Errorf("dmesg failed: %w", err)
		}
	}
	maxLines, _ := GetMaxLines(params)
	maxSize, _ := GetMaxSizeMB(params)
	output = LimitOutput(output, maxLines, maxSize)
	return WriteOutput(outputPath, output)
}

// ── lsmod (loaded kernel modules) ────────────────────────────────────────────
// Lists all currently loaded kernel modules. Rootkits and certain persistence
// mechanisms rely on malicious kernel modules.

type LinuxLsmod struct{ Module }

func NewLinuxLsmod() *LinuxLsmod {
	return &LinuxLsmod{Module: NewModule("linux_lsmod", "system/linux/lsmod.txt")}
}

func (m *LinuxLsmod) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	if _, err := exec.LookPath("lsmod"); err != nil {
		// Fall back to reading /proc/modules directly
		return copyIfExists(outputPath, "/proc/modules")
	}
	return runCommandToFile(ctx, outputPath, params, "lsmod")
}

// ── zsh history (per-user) ────────────────────────────────────────────────────
// Collects .zsh_history for all user home directories.
// Complements bash history — many modern systems use zsh as the default shell.

type LinuxZshHistory struct{ Module }

func NewLinuxZshHistory() *LinuxZshHistory {
	return &LinuxZshHistory{Module: NewModule("linux_zsh_history", "system/linux/zsh_history.txt")}
}

func (m *LinuxZshHistory) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	paths := listZshHistories()
	if len(paths) == 0 {
		if writeErr := WriteNotFound(outputPath, "zsh_history not found"); writeErr != nil {
			return writeErr
		}
		return NewWarningError("zsh_history not found")
	}
	var combined []byte
	for _, path := range paths {
		data, err := os.ReadFile(path)
		if err != nil {
			combined = append(combined, []byte(fmt.Sprintf("[%s] not readable\n", path))...)
			combined = addSeparator(combined)
			continue
		}
		combined = append(combined, formatMultiFileContent("zsh_history", path, data)...)
		combined = addSeparator(combined)
	}
	maxLines, _ := GetMaxLines(params)
	maxSize, _ := GetMaxSizeMB(params)
	combined = LimitOutput(combined, maxLines, maxSize)
	return WriteOutput(outputPath, combined)
}

func listZshHistories() []string {
	var results []string
	paths, _ := filepath.Glob("/home/*/.zsh_history")
	results = append(results, paths...)
	if _, err := os.Stat("/root/.zsh_history"); err == nil {
		results = append(results, "/root/.zsh_history")
	}
	return results
}

// ── /etc/ssh/sshd_config ─────────────────────────────────────────────────────
// Copies the SSH daemon configuration. Attackers may modify this to
// allow password auth, permit root login, or add authorized keys paths.

type LinuxSshdConfig struct{ Module }

func NewLinuxSshdConfig() *LinuxSshdConfig {
	return &LinuxSshdConfig{Module: NewModule("linux_sshd_config", "system/linux/sshd_config.txt")}
}

func (m *LinuxSshdConfig) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	var combined []byte
	for _, src := range []string{"/etc/ssh/sshd_config", "/etc/sshd_config"} {
		if data, err := os.ReadFile(src); err == nil {
			combined = append(combined, formatMultiFileContent("file", src, data)...)
			combined = addSeparator(combined)
		}
	}
	// Include drop-in configs
	entries, _ := os.ReadDir("/etc/ssh/sshd_config.d")
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		path := filepath.Join("/etc/ssh/sshd_config.d", entry.Name())
		if data, err := os.ReadFile(path); err == nil {
			combined = append(combined, formatMultiFileContent("file", path, data)...)
			combined = addSeparator(combined)
		}
	}
	if len(combined) == 0 {
		return WriteNotFound(outputPath, "sshd_config not found")
	}
	return WriteOutput(outputPath, combined)
}

// ── /etc/ld.so.preload ────────────────────────────────────────────────────────
// Checks for /etc/ld.so.preload which is a common rootkit persistence mechanism.
// Any entry here is loaded into every process before standard libraries.

type LinuxLdPreload struct{ Module }

func NewLinuxLdPreload() *LinuxLdPreload {
	return &LinuxLdPreload{Module: NewModule("linux_ld_preload", "persistence/linux/ld_preload.txt")}
}

func (m *LinuxLdPreload) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	data, err := os.ReadFile("/etc/ld.so.preload")
	if err != nil {
		if os.IsNotExist(err) {
			return WriteOutput(outputPath, []byte("NOT FOUND: /etc/ld.so.preload does not exist (normal)\n"))
		}
		return WriteOutput(outputPath, []byte(fmt.Sprintf("ERROR reading /etc/ld.so.preload: %v\n", err)))
	}
	header := []byte("WARNING: /etc/ld.so.preload EXISTS — review contents carefully:\n\n")
	return WriteOutput(outputPath, append(header, data...))
}

// ── /etc/environment + profile ────────────────────────────────────────────────
// Collects system-wide environment configuration files.
// Used for detecting persistent environment variable manipulation.

type LinuxEnvironment struct{ Module }

func NewLinuxEnvironment() *LinuxEnvironment {
	return &LinuxEnvironment{Module: NewModule("linux_environment", "system/linux/environment.txt")}
}

func (m *LinuxEnvironment) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	var combined []byte
	envFiles := []string{
		"/etc/environment",
		"/etc/profile",
		"/etc/bash.bashrc",
		"/etc/zsh/zshenv",
	}
	for _, src := range envFiles {
		if data, err := os.ReadFile(src); err == nil {
			combined = append(combined, formatMultiFileContent("file", src, data)...)
			combined = addSeparator(combined)
		}
	}
	// profile.d drop-ins
	entries, _ := os.ReadDir("/etc/profile.d")
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		path := filepath.Join("/etc/profile.d", entry.Name())
		if data, err := os.ReadFile(path); err == nil {
			combined = append(combined, formatMultiFileContent("file", path, data)...)
			combined = addSeparator(combined)
		}
	}
	if len(combined) == 0 {
		return WriteNotFound(outputPath, "no environment files found")
	}
	maxLines, _ := GetMaxLines(params)
	maxSize, _ := GetMaxSizeMB(params)
	combined = LimitOutput(combined, maxLines, maxSize)
	return WriteOutput(outputPath, combined)
}

// ── /etc/pam.d ────────────────────────────────────────────────────────────────
// Collects PAM (Pluggable Authentication Modules) configuration.
// Attackers modify PAM configs to install backdoors that accept any password.

type LinuxPAMConfig struct{ Module }

func NewLinuxPAMConfig() *LinuxPAMConfig {
	return &LinuxPAMConfig{Module: NewModule("linux_pam_config", "persistence/linux/pam_config.txt")}
}

func (m *LinuxPAMConfig) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	var combined []byte
	entries, err := os.ReadDir("/etc/pam.d")
	if err != nil {
		return WriteNotFound(outputPath, "/etc/pam.d not accessible")
	}
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		path := filepath.Join("/etc/pam.d", entry.Name())
		if data, err := os.ReadFile(path); err == nil {
			combined = append(combined, formatMultiFileContent("pam", path, data)...)
			combined = addSeparator(combined)
		}
	}
	if len(combined) == 0 {
		return WriteNotFound(outputPath, "/etc/pam.d is empty or not readable")
	}
	maxLines, _ := GetMaxLines(params)
	maxSize, _ := GetMaxSizeMB(params)
	combined = LimitOutput(combined, maxLines, maxSize)
	return WriteOutput(outputPath, combined)
}

// ── Running containers (Docker/Podman) ───────────────────────────────────────
// Lists running and stopped containers if Docker or Podman is available.
// Attackers may use containers for privilege escalation (socket escape) or C2.

type LinuxContainers struct{ Module }

func NewLinuxContainers() *LinuxContainers {
	return &LinuxContainers{Module: NewModule("linux_containers", "volatile/linux/containers.txt")}
}

func (m *LinuxContainers) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	var combined []byte

	for _, runtime := range []string{"docker", "podman"} {
		if _, err := exec.LookPath(runtime); err != nil {
			continue
		}
		cmd := exec.CommandContext(ctx, runtime, "ps", "-a", "--format", "table {{.ID}}\t{{.Image}}\t{{.Command}}\t{{.Status}}\t{{.Names}}")
		output, err := cmd.CombinedOutput()
		if err != nil {
			combined = append(combined, []byte(fmt.Sprintf("[%s] error: %v\n", runtime, err))...)
			continue
		}
		combined = append(combined, formatMultiFileContent(runtime, "containers", output)...)
		combined = addSeparator(combined)

		// Also list images
		cmdImg := exec.CommandContext(ctx, runtime, "images", "--format", "table {{.Repository}}\t{{.Tag}}\t{{.ID}}\t{{.Size}}")
		if imgOutput, imgErr := cmdImg.CombinedOutput(); imgErr == nil {
			combined = append(combined, formatMultiFileContent(runtime, "images", imgOutput)...)
			combined = addSeparator(combined)
		}
	}

	if len(combined) == 0 {
		return WriteNotFound(outputPath, "no container runtime (docker/podman) found")
	}
	maxLines, _ := GetMaxLines(params)
	maxSize, _ := GetMaxSizeMB(params)
	combined = LimitOutput(combined, maxLines, maxSize)
	return WriteOutput(outputPath, combined)
}
