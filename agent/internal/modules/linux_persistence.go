package modules

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
)

type LinuxCron struct {
	Module
}

type LinuxSystemdUnits struct {
	Module
}

type LinuxSystemdTimers struct {
	Module
}

type LinuxRcLocal struct {
	Module
}

type LinuxAuthorizedKeys struct {
	Module
}

func NewLinuxCron() *LinuxCron {
	return &LinuxCron{Module: NewModule("linux_cron", "persistence/linux/cron.txt")}
}

func NewLinuxSystemdUnits() *LinuxSystemdUnits {
	return &LinuxSystemdUnits{Module: NewModule("linux_systemd_units", "persistence/linux/systemd_units.txt")}
}

func NewLinuxSystemdTimers() *LinuxSystemdTimers {
	return &LinuxSystemdTimers{Module: NewModule("linux_systemd_timers", "persistence/linux/systemd_timers.txt")}
}

func NewLinuxRcLocal() *LinuxRcLocal {
	return &LinuxRcLocal{Module: NewModule("linux_rc_local", "persistence/linux/rc_local.txt")}
}

func NewLinuxAuthorizedKeys() *LinuxAuthorizedKeys {
	return &LinuxAuthorizedKeys{Module: NewModule("linux_authorized_keys", "persistence/linux/authorized_keys.txt")}
}

func (m *LinuxCron) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	var combined []byte
	paths := []string{"/etc/crontab"}
	cronDirs := []string{"/etc/cron.d", "/etc/cron.daily", "/etc/cron.hourly", "/etc/cron.weekly", "/etc/cron.monthly", "/var/spool/cron"}

	for _, path := range paths {
		if data, err := os.ReadFile(path); err == nil {
			combined = append(combined, formatMultiFileContent("file", path, data)...)
			combined = addSeparator(combined)
		}
	}

	for _, dir := range cronDirs {
		entries, err := os.ReadDir(dir)
		if err != nil {
			continue
		}
		for _, entry := range entries {
			if entry.IsDir() {
				continue
			}
			filePath := filepath.Join(dir, entry.Name())
			if data, err := os.ReadFile(filePath); err == nil {
				combined = append(combined, formatMultiFileContent("file", filePath, data)...)
				combined = addSeparator(combined)
			}
		}
	}

	cmd := exec.CommandContext(ctx, "crontab", "-l")
	if output, err := cmd.CombinedOutput(); err == nil {
		combined = append(combined, formatMultiFileContent("crontab", "current_user", output)...)
	}

	if len(combined) == 0 {
		if writeErr := WriteNotFound(outputPath, "cron entries not accessible"); writeErr != nil {
			return writeErr
		}
		return NewWarningError("cron entries not accessible")
	}

	maxLines, _ := GetMaxLines(params)
	maxSize, _ := GetMaxSizeMB(params)
	combined = LimitOutput(combined, maxLines, maxSize)
	return WriteOutput(outputPath, combined)
}

func (m *LinuxSystemdUnits) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	if _, err := exec.LookPath("systemctl"); err != nil {
		note := "systemctl not available"
		if writeErr := WriteNotFound(outputPath, note); writeErr != nil {
			return writeErr
		}
		return NewWarningError(note)
	}
	return runCommandToFile(ctx, outputPath, params, "systemctl", "list-unit-files", "--type=service", "--state=enabled")
}

func (m *LinuxSystemdTimers) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	if _, err := exec.LookPath("systemctl"); err != nil {
		note := "systemctl not available"
		if writeErr := WriteNotFound(outputPath, note); writeErr != nil {
			return writeErr
		}
		return NewWarningError(note)
	}
	return runCommandToFile(ctx, outputPath, params, "systemctl", "list-timers", "--all")
}

func (m *LinuxRcLocal) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	return copyIfExists(outputPath, "/etc/rc.local")
}

func (m *LinuxAuthorizedKeys) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	paths := listAuthorizedKeys()
	if len(paths) == 0 {
		if writeErr := WriteNotFound(outputPath, "authorized_keys not found"); writeErr != nil {
			return writeErr
		}
		return NewWarningError("authorized_keys not found")
	}

	var combined []byte
	for _, path := range paths {
		data, err := os.ReadFile(path)
		if err != nil {
			combined = append(combined, []byte(fmt.Sprintf("[%s] not readable\n", path))...)
			combined = addSeparator(combined)
			continue
		}
		combined = append(combined, formatMultiFileContent("authorized_keys", path, data)...)
		combined = addSeparator(combined)
	}

	maxLines, _ := GetMaxLines(params)
	maxSize, _ := GetMaxSizeMB(params)
	combined = LimitOutput(combined, maxLines, maxSize)
	return WriteOutput(outputPath, combined)
}
