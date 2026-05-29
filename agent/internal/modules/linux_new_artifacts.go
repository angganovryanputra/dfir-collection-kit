// Package modules — additional Linux forensic artifact collection modules.
// Adds critical DFIR artifacts missing from the original set:
//   - Per-user crontabs (/var/spool/cron/crontabs/)
//   - User shell configs (.bashrc, .bash_profile, .profile per user)
//   - Firewall rules (iptables/nftables/ufw)
//   - lastlog (last login time per account)
//   - SSH keys per user (~/.ssh/)
//   - Full network configuration
//   - setuid/setgid binaries
//   - /proc/net network state (no tools required)
//   - SysV init scripts (/etc/init.d/)
//   - at jobs (/var/spool/at/)
//   - Package installation history
//   - /etc/profile.d/ scripts (global shell persistence)
//   - Systemd service unit override files
package modules

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
)

// ── Per-User Crontabs ─────────────────────────────────────────────────────────
// /var/spool/cron/crontabs/ — per-user cron jobs (DIFFERENT from /etc/crontab).
// The existing linux_cron only captures /etc/crontab and /etc/cron.d/.
// Per-user crontabs are a very common attacker persistence mechanism.

type LinuxUserCrontabs struct{ Module }

func NewLinuxUserCrontabs() *LinuxUserCrontabs {
	return &LinuxUserCrontabs{NewModule("linux_user_crontabs", "persistence/linux/user_crontabs/")}
}

func (m *LinuxUserCrontabs) Run(ctx context.Context, _ ModuleContext, _ map[string]interface{}, outputPath string) error {
	if err := os.MkdirAll(outputPath, 0755); err != nil {
		return fmt.Errorf("mkdir failed: %w", err)
	}
	cronDirs := []string{"/var/spool/cron/crontabs", "/var/spool/cron"}
	var collected int
	for _, dir := range cronDirs {
		entries, err := os.ReadDir(dir)
		if err != nil {
			continue
		}
		for _, entry := range entries {
			if entry.IsDir() {
				continue
			}
			src := filepath.Join(dir, entry.Name())
			data, err := os.ReadFile(src)
			if err != nil {
				continue
			}
			header := fmt.Sprintf("# crontab: %s (path: %s)\n", entry.Name(), src)
			dst := filepath.Join(outputPath, entry.Name()+".crontab")
			if writeErr := WriteOutput(dst, append([]byte(header), data...)); writeErr == nil {
				collected++
			}
		}
	}
	// Also list all cron directories for completeness
	for _, dir := range []string{"/etc/cron.daily", "/etc/cron.weekly", "/etc/cron.monthly", "/etc/cron.hourly"} {
		if entries, err := os.ReadDir(dir); err == nil {
			var names []string
			for _, e := range entries {
				names = append(names, e.Name())
			}
			if len(names) > 0 {
				content := fmt.Sprintf("# %s:\n", dir)
				for _, n := range names {
					content += "  " + n + "\n"
				}
				_ = WriteOutput(filepath.Join(outputPath, filepath.Base(dir)+".list"), []byte(content))
			}
		}
	}
	if collected == 0 {
		_ = WriteNotFound(filepath.Join(outputPath, "no_user_crontabs.txt"), "no per-user crontabs found in /var/spool/cron/")
	}
	return nil
}

// ── Per-User Shell Configuration Files ───────────────────────────────────────
// .bashrc, .bash_profile, .profile, .zshrc etc. for ALL users including root.
// Attackers append malicious commands to these for login persistence (T1546.004).

type LinuxUserShellConfigs struct{ Module }

func NewLinuxUserShellConfigs() *LinuxUserShellConfigs {
	return &LinuxUserShellConfigs{NewModule("linux_user_shell_configs", "persistence/linux/user_shell_configs.txt")}
}

func (m *LinuxUserShellConfigs) Run(_ context.Context, _ ModuleContext, _ map[string]interface{}, outputPath string) error {
	if err := os.MkdirAll(filepath.Dir(outputPath), 0755); err != nil {
		return fmt.Errorf("mkdir failed: %w", err)
	}
	homeDirs := []string{"/root"}
	if entries, err := os.ReadDir("/home"); err == nil {
		for _, e := range entries {
			if e.IsDir() {
				homeDirs = append(homeDirs, filepath.Join("/home", e.Name()))
			}
		}
	}
	shellFiles := []string{
		".bashrc", ".bash_profile", ".bash_logout", ".profile",
		".zshrc", ".zprofile", ".zshenv", ".zlogout",
		".tcshrc", ".cshrc",
		".config/fish/config.fish",
	}
	var combined []byte
	for _, homeDir := range homeDirs {
		username := filepath.Base(homeDir)
		for _, fname := range shellFiles {
			data, err := os.ReadFile(filepath.Join(homeDir, fname))
			if err != nil {
				continue
			}
			header := fmt.Sprintf("### %s / %s ###\n", username, fname)
			combined = append(combined, []byte(header)...)
			combined = append(combined, data...)
			combined = append(combined, []byte("\n\n")...)
		}
	}
	if len(combined) == 0 {
		return WriteNotFound(outputPath, "no shell config files found")
	}
	return WriteOutput(outputPath, combined)
}

// ── Firewall Rules (iptables / nftables / ufw) ───────────────────────────────
// Collects current firewall rules from all available tools.
// Attackers add rules to open C2 ports or block security tools.

type LinuxIPTables struct{ Module }

func NewLinuxIPTables() *LinuxIPTables {
	return &LinuxIPTables{NewModule("linux_iptables_rules", "system/linux/firewall_rules.txt")}
}

func (m *LinuxIPTables) Run(ctx context.Context, _ ModuleContext, _ map[string]interface{}, outputPath string) error {
	if err := os.MkdirAll(filepath.Dir(outputPath), 0755); err != nil {
		return fmt.Errorf("mkdir failed: %w", err)
	}
	var combined []byte

	for _, bin := range []string{"iptables-save", "iptables"} {
		if path, err := exec.LookPath(bin); err == nil {
			args := []string{}
			if bin == "iptables" {
				args = []string{"-nvL"}
			}
			cmd := exec.CommandContext(ctx, path, args...)
			if out, err := cmd.CombinedOutput(); err == nil {
				combined = append(combined, formatMultiFileContent("iptables", bin, out)...)
				combined = addSeparator(combined)
				break
			}
		}
	}
	if path, err := exec.LookPath("ip6tables-save"); err == nil {
		if out, err2 := exec.CommandContext(ctx, path).CombinedOutput(); err2 == nil {
			combined = append(combined, formatMultiFileContent("ip6tables", "ip6tables-save", out)...)
			combined = addSeparator(combined)
		}
	}
	if path, err := exec.LookPath("nft"); err == nil {
		if out, err2 := exec.CommandContext(ctx, path, "list", "ruleset").CombinedOutput(); err2 == nil {
			combined = append(combined, formatMultiFileContent("nftables", "nft list ruleset", out)...)
			combined = addSeparator(combined)
		}
	}
	if path, err := exec.LookPath("ufw"); err == nil {
		if out, err2 := exec.CommandContext(ctx, path, "status", "verbose").CombinedOutput(); err2 == nil {
			combined = append(combined, formatMultiFileContent("ufw", "ufw status verbose", out)...)
			combined = addSeparator(combined)
		}
	}
	for _, f := range []string{"/etc/iptables/rules.v4", "/etc/iptables/rules.v6", "/etc/iptables.rules"} {
		if data, err := os.ReadFile(f); err == nil {
			combined = append(combined, formatMultiFileContent("saved", f, data)...)
			combined = addSeparator(combined)
		}
	}
	if len(combined) == 0 {
		return WriteNotFound(outputPath, "no firewall tools available (iptables/nftables/ufw)")
	}
	return WriteOutput(outputPath, combined)
}

// ── lastlog (Last Login Time per Account) ─────────────────────────────────────
// Identifies dormant accounts recently activated by attackers.

type LinuxLastLog struct{ Module }

func NewLinuxLastLog() *LinuxLastLog {
	return &LinuxLastLog{NewModule("linux_lastlog", "logs/linux/lastlog.txt")}
}

func (m *LinuxLastLog) Run(ctx context.Context, _ ModuleContext, _ map[string]interface{}, outputPath string) error {
	if err := os.MkdirAll(filepath.Dir(outputPath), 0755); err != nil {
		return fmt.Errorf("mkdir failed: %w", err)
	}
	if path, err := exec.LookPath("lastlog"); err == nil {
		if out, err2 := exec.CommandContext(ctx, path).CombinedOutput(); err2 == nil && len(out) > 0 {
			return WriteOutput(outputPath, out)
		}
	}
	if path, err := exec.LookPath("last"); err == nil {
		if out, err2 := exec.CommandContext(ctx, path, "-a", "-F", "-n", "1000").CombinedOutput(); err2 == nil {
			return WriteOutput(outputPath, out)
		}
	}
	return WriteNotFound(outputPath, "lastlog/last command not available")
}

// ── SSH Keys per User ─────────────────────────────────────────────────────────
// Collects all SSH keys and authorized_keys for lateral movement evidence.

type LinuxSSHKeys struct{ Module }

func NewLinuxSSHKeys() *LinuxSSHKeys {
	return &LinuxSSHKeys{NewModule("linux_ssh_keys", "artifacts/linux/ssh_keys/")}
}

func (m *LinuxSSHKeys) Run(_ context.Context, _ ModuleContext, _ map[string]interface{}, outputPath string) error {
	if err := os.MkdirAll(outputPath, 0755); err != nil {
		return fmt.Errorf("mkdir failed: %w", err)
	}
	homeDirs := []string{"/root"}
	if entries, err := os.ReadDir("/home"); err == nil {
		for _, e := range entries {
			if e.IsDir() {
				homeDirs = append(homeDirs, filepath.Join("/home", e.Name()))
			}
		}
	}
	keyFiles := []string{
		"id_rsa", "id_rsa.pub", "id_ed25519", "id_ed25519.pub",
		"id_ecdsa", "id_ecdsa.pub", "id_dsa", "id_dsa.pub",
		"authorized_keys", "authorized_keys2", "known_hosts", "config",
	}
	var collected int
	for _, homeDir := range homeDirs {
		username := filepath.Base(homeDir)
		sshDir := filepath.Join(homeDir, ".ssh")
		for _, fname := range keyFiles {
			if data, err := os.ReadFile(filepath.Join(sshDir, fname)); err == nil {
				if writeErr := WriteOutput(filepath.Join(outputPath, username+"_"+fname), data); writeErr == nil {
					collected++
				}
			}
		}
	}
	if collected == 0 {
		_ = WriteNotFound(filepath.Join(outputPath, "no_ssh_keys.txt"), "no SSH keys found")
	}
	return nil
}

// ── Full Network Configuration ────────────────────────────────────────────────
// Collects from /etc/network/interfaces, /etc/netplan/, NetworkManager, ip commands.

type LinuxNetworkConfig struct{ Module }

func NewLinuxNetworkConfig() *LinuxNetworkConfig {
	return &LinuxNetworkConfig{NewModule("linux_network_config", "system/linux/network_config/")}
}

func (m *LinuxNetworkConfig) Run(ctx context.Context, _ ModuleContext, _ map[string]interface{}, outputPath string) error {
	if err := os.MkdirAll(outputPath, 0755); err != nil {
		return fmt.Errorf("mkdir failed: %w", err)
	}
	var collected int
	for _, src := range []string{
		"/etc/network/interfaces",
		"/etc/sysconfig/network",
	} {
		if data, err := os.ReadFile(src); err == nil {
			_ = WriteOutput(filepath.Join(outputPath, sanitizeFileName(src)+".txt"), data)
			collected++
		}
	}
	for _, dir := range []string{"/etc/network/interfaces.d", "/etc/netplan", "/etc/NetworkManager/system-connections"} {
		if entries, err := os.ReadDir(dir); err == nil {
			for _, e := range entries {
				if !e.IsDir() {
					if data, err2 := os.ReadFile(filepath.Join(dir, e.Name())); err2 == nil {
						_ = WriteOutput(filepath.Join(outputPath, sanitizeFileName(dir)+"_"+e.Name()), data)
						collected++
					}
				}
			}
		}
	}
	if path, err := exec.LookPath("ip"); err == nil {
		for _, args := range [][]string{{"addr", "show"}, {"route", "show"}, {"link", "show"}} {
			if out, err2 := exec.CommandContext(ctx, path, args...).CombinedOutput(); err2 == nil {
				_ = WriteOutput(filepath.Join(outputPath, "ip_"+args[0]+".txt"), out)
				collected++
			}
		}
	}
	if collected == 0 {
		return WriteNotFound(filepath.Join(outputPath, "error.txt"), "no network config found")
	}
	return nil
}

// ── setuid / setgid Binaries ──────────────────────────────────────────────────
// Lists SUID/SGID files — attackers install SUID shells for privilege escalation.

type LinuxSetuidBinaries struct{ Module }

func NewLinuxSetuidBinaries() *LinuxSetuidBinaries {
	return &LinuxSetuidBinaries{NewModule("linux_setuid_binaries", "system/linux/setuid_binaries.txt")}
}

func (m *LinuxSetuidBinaries) Run(ctx context.Context, _ ModuleContext, _ map[string]interface{}, outputPath string) error {
	if err := os.MkdirAll(filepath.Dir(outputPath), 0755); err != nil {
		return fmt.Errorf("mkdir failed: %w", err)
	}
	if path, err := exec.LookPath("find"); err == nil {
		cmd := exec.CommandContext(ctx, path,
			"/", "-xdev",
			"(", "-perm", "/4000", "-o", "-perm", "/2000", ")",
			"-type", "f", "-ls",
		)
		if out, err2 := cmd.CombinedOutput(); err2 == nil && len(out) > 0 {
			header := []byte("# SUID (4000) and SGID (2000) files — review any in unusual paths\n\n")
			return WriteOutput(outputPath, append(header, out...))
		}
	}
	return WriteNotFound(outputPath, "find not available for SUID/SGID enumeration")
}

// ── /proc/net Network State (No Tools Required) ───────────────────────────────
// Raw kernel network tables — works on minimal systems without ss/netstat.

type LinuxProcNet struct{ Module }

func NewLinuxProcNet() *LinuxProcNet {
	return &LinuxProcNet{NewModule("linux_proc_net", "volatile/linux/proc_net/")}
}

func (m *LinuxProcNet) Run(_ context.Context, _ ModuleContext, _ map[string]interface{}, outputPath string) error {
	if err := os.MkdirAll(outputPath, 0755); err != nil {
		return fmt.Errorf("mkdir failed: %w", err)
	}
	procFiles := []string{
		"/proc/net/tcp", "/proc/net/tcp6",
		"/proc/net/udp", "/proc/net/udp6",
		"/proc/net/unix", "/proc/net/arp",
		"/proc/net/route", "/proc/net/if_inet6",
	}
	var collected int
	for _, src := range procFiles {
		if data, err := os.ReadFile(src); err == nil {
			dst := filepath.Base(src) + ".txt"
			if writeErr := WriteOutput(filepath.Join(outputPath, dst), data); writeErr == nil {
				collected++
			}
		}
	}
	if collected == 0 {
		return WriteNotFound(filepath.Join(outputPath, "error.txt"), "/proc/net not accessible")
	}
	return nil
}

// ── SysV Init Scripts (/etc/init.d/) ─────────────────────────────────────────
// Legacy init scripts — still present on many systems and used for persistence.

type LinuxInitScripts struct{ Module }

func NewLinuxInitScripts() *LinuxInitScripts {
	return &LinuxInitScripts{NewModule("linux_init_scripts", "persistence/linux/init_scripts.txt")}
}

func (m *LinuxInitScripts) Run(_ context.Context, _ ModuleContext, _ map[string]interface{}, outputPath string) error {
	if err := os.MkdirAll(filepath.Dir(outputPath), 0755); err != nil {
		return fmt.Errorf("mkdir failed: %w", err)
	}
	entries, err := os.ReadDir("/etc/init.d")
	if err != nil {
		return WriteNotFound(outputPath, "/etc/init.d not found")
	}
	var combined []byte
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		src := filepath.Join("/etc/init.d", entry.Name())
		if data, err := os.ReadFile(src); err == nil {
			combined = append(combined, formatMultiFileContent("init.d", src, data)...)
			combined = addSeparator(combined)
		}
	}
	if len(combined) == 0 {
		return WriteNotFound(outputPath, "/etc/init.d is empty")
	}
	return WriteOutput(outputPath, combined)
}

// ── at Jobs (/var/spool/at/) ──────────────────────────────────────────────────
// Scheduled at(1) jobs — one-time deferred execution used by some attackers.

type LinuxAtJobs struct{ Module }

func NewLinuxAtJobs() *LinuxAtJobs {
	return &LinuxAtJobs{NewModule("linux_at_jobs", "persistence/linux/at_jobs/")}
}

func (m *LinuxAtJobs) Run(ctx context.Context, _ ModuleContext, _ map[string]interface{}, outputPath string) error {
	if err := os.MkdirAll(outputPath, 0755); err != nil {
		return fmt.Errorf("mkdir failed: %w", err)
	}
	var collected int
	for _, dir := range []string{"/var/spool/at", "/var/spool/cron/atjobs"} {
		entries, err := os.ReadDir(dir)
		if err != nil {
			continue
		}
		for _, entry := range entries {
			if entry.IsDir() || entry.Name()[0] == '.' {
				continue
			}
			src := filepath.Join(dir, entry.Name())
			if data, err := os.ReadFile(src); err == nil {
				if writeErr := WriteOutput(filepath.Join(outputPath, entry.Name()+".at"), data); writeErr == nil {
					collected++
				}
			}
		}
	}
	if path, err := exec.LookPath("atq"); err == nil {
		if out, err2 := exec.CommandContext(ctx, path).CombinedOutput(); err2 == nil {
			_ = WriteOutput(filepath.Join(outputPath, "atq_output.txt"), out)
		}
	}
	if collected == 0 {
		_ = WriteNotFound(filepath.Join(outputPath, "no_at_jobs.txt"), "no at jobs found")
	}
	return nil
}

// ── Package Installation History ─────────────────────────────────────────────
// dpkg.log, apt history.log, yum.log, dnf.log — recently installed packages.

type LinuxPackageHistory struct{ Module }

func NewLinuxPackageHistory() *LinuxPackageHistory {
	return &LinuxPackageHistory{NewModule("linux_package_history", "logs/linux/package_history/")}
}

func (m *LinuxPackageHistory) Run(ctx context.Context, _ ModuleContext, _ map[string]interface{}, outputPath string) error {
	if err := os.MkdirAll(outputPath, 0755); err != nil {
		return fmt.Errorf("mkdir failed: %w", err)
	}
	sources := []struct{ src, dst string }{
		{"/var/log/dpkg.log", "dpkg.log"},
		{"/var/log/dpkg.log.1", "dpkg.log.1"},
		{"/var/log/apt/history.log", "apt_history.log"},
		{"/var/log/yum.log", "yum.log"},
		{"/var/log/dnf.log", "dnf.log"},
		{"/var/log/zypp/history", "zypper_history.log"},
	}
	var collected int
	for _, s := range sources {
		if data, err := os.ReadFile(s.src); err == nil {
			if writeErr := WriteOutput(filepath.Join(outputPath, s.dst), data); writeErr == nil {
				collected++
			}
		}
	}
	if path, err := exec.LookPath("rpm"); err == nil {
		if out, err2 := exec.CommandContext(ctx, path, "-qa", "--queryformat",
			"%{INSTALLTIME:date}|%{NAME}|%{VERSION}|%{ARCH}\n").CombinedOutput(); err2 == nil {
			_ = WriteOutput(filepath.Join(outputPath, "rpm_installed.txt"), out)
			collected++
		}
	}
	if path, err := exec.LookPath("dpkg"); err == nil {
		if out, err2 := exec.CommandContext(ctx, path, "-l").CombinedOutput(); err2 == nil {
			_ = WriteOutput(filepath.Join(outputPath, "dpkg_list.txt"), out)
			collected++
		}
	}
	if collected == 0 {
		return WriteNotFound(filepath.Join(outputPath, "error.txt"), "no package logs found")
	}
	return nil
}

// ── /etc/profile.d/ Scripts ──────────────────────────────────────────────────
// Global shell scripts sourced on every login — common persistence location.

type LinuxProfileD struct{ Module }

func NewLinuxProfileD() *LinuxProfileD {
	return &LinuxProfileD{NewModule("linux_profile_d", "persistence/linux/profile_d.txt")}
}

func (m *LinuxProfileD) Run(_ context.Context, _ ModuleContext, _ map[string]interface{}, outputPath string) error {
	if err := os.MkdirAll(filepath.Dir(outputPath), 0755); err != nil {
		return fmt.Errorf("mkdir failed: %w", err)
	}
	entries, err := os.ReadDir("/etc/profile.d")
	if err != nil {
		return WriteNotFound(outputPath, "/etc/profile.d not found")
	}
	var combined []byte
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		src := filepath.Join("/etc/profile.d", entry.Name())
		if data, err := os.ReadFile(src); err == nil {
			combined = append(combined, formatMultiFileContent("profile.d", src, data)...)
			combined = addSeparator(combined)
		}
	}
	if len(combined) == 0 {
		return WriteNotFound(outputPath, "/etc/profile.d is empty")
	}
	return WriteOutput(outputPath, combined)
}

// ── Systemd Service Unit Override Files ──────────────────────────────────────
// /etc/systemd/system/*.service and drop-in overrides — attacker persistence (T1543.002).

type LinuxSystemdOverrides struct{ Module }

func NewLinuxSystemdOverrides() *LinuxSystemdOverrides {
	return &LinuxSystemdOverrides{NewModule("linux_systemd_overrides", "persistence/linux/systemd_overrides/")}
}

func (m *LinuxSystemdOverrides) Run(_ context.Context, _ ModuleContext, _ map[string]interface{}, outputPath string) error {
	if err := os.MkdirAll(outputPath, 0755); err != nil {
		return fmt.Errorf("mkdir failed: %w", err)
	}
	validExts := map[string]bool{".service": true, ".timer": true, ".socket": true, ".path": true, ".mount": true}
	dirs := []string{"/etc/systemd/system", "/run/systemd/system"}
	var collected int
	for _, dir := range dirs {
		entries, err := os.ReadDir(dir)
		if err != nil {
			continue
		}
		dstSubdir := filepath.Join(outputPath, sanitizeFileName(dir))
		_ = os.MkdirAll(dstSubdir, 0755)
		for _, entry := range entries {
			src := filepath.Join(dir, entry.Name())
			if entry.IsDir() {
				// Collect drop-in .d/ directory contents
				subEntries, err := os.ReadDir(src)
				if err != nil {
					continue
				}
				for _, sub := range subEntries {
					if data, err2 := os.ReadFile(filepath.Join(src, sub.Name())); err2 == nil {
						_ = WriteOutput(filepath.Join(dstSubdir, entry.Name()+"_"+sub.Name()), data)
						collected++
					}
				}
			} else if validExts[filepath.Ext(entry.Name())] {
				if data, err := os.ReadFile(src); err == nil {
					if writeErr := WriteOutput(filepath.Join(dstSubdir, entry.Name()), data); writeErr == nil {
						collected++
					}
				}
			}
		}
	}
	if collected == 0 {
		return WriteNotFound(filepath.Join(outputPath, "error.txt"), "no custom systemd unit files found")
	}
	return nil
}
