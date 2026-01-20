package modules

import (
	"context"
	"fmt"
	"os/exec"
)

type LinuxJournalCtl struct {
	Module
}

type LinuxSyslog struct {
	Module
}

type LinuxAuthLogs struct {
	Module
}

type LinuxWtmp struct {
	Module
}

type LinuxBtmp struct {
	Module
}

func NewLinuxJournalCtl() *LinuxJournalCtl {
	return &LinuxJournalCtl{Module: NewModule("linux_journalctl", "logs/linux/journalctl.log")}
}

func NewLinuxSyslog() *LinuxSyslog {
	return &LinuxSyslog{Module: NewModule("linux_syslog", "logs/linux/syslog.log")}
}

func NewLinuxAuthLogs() *LinuxAuthLogs {
	return &LinuxAuthLogs{Module: NewModule("linux_auth_logs", "logs/linux/auth.log")}
}

func NewLinuxWtmp() *LinuxWtmp {
	return &LinuxWtmp{Module: NewModule("linux_wtmp", "logs/linux/wtmp.txt")}
}

func NewLinuxBtmp() *LinuxBtmp {
	return &LinuxBtmp{Module: NewModule("linux_btmp", "logs/linux/btmp.txt")}
}

func (m *LinuxJournalCtl) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	if _, err := exec.LookPath("journalctl"); err != nil {
		note := "journalctl not available"
		if writeErr := WriteNotFound(outputPath, note); writeErr != nil {
			return writeErr
		}
		return NewWarningError(note)
	}
	window := GetTimeWindowDays(params)
	since := fmt.Sprintf("-%d days", window)
	return runCommandToFile(ctx, outputPath, params, "journalctl", "--no-pager", "--since", since)
}

func (m *LinuxSyslog) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	paths := []string{"/var/log/syslog", "/var/log/messages"}
	data, path, err := readFirstExisting(paths)
	if err != nil {
		if writeErr := WriteNotFound(outputPath, "syslog/messages not found"); writeErr != nil {
			return writeErr
		}
		return NewWarningError("missing syslog/messages")
	}
	content := formatMultiFileContent("source", path, data)
	return WriteOutput(outputPath, content)
}

func (m *LinuxAuthLogs) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	paths := []string{"/var/log/auth.log", "/var/log/secure"}
	data, path, err := readFirstExisting(paths)
	if err != nil {
		if writeErr := WriteNotFound(outputPath, "auth.log/secure not found"); writeErr != nil {
			return writeErr
		}
		return NewWarningError("missing auth.log/secure")
	}
	content := formatMultiFileContent("source", path, data)
	return WriteOutput(outputPath, content)
}

func (m *LinuxWtmp) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	if _, err := exec.LookPath("last"); err != nil {
		note := "last command not available"
		if writeErr := WriteNotFound(outputPath, note); writeErr != nil {
			return writeErr
		}
		return NewWarningError(note)
	}
	if _, err := exec.LookPath("last"); err == nil {
		cmd := exec.CommandContext(ctx, "last", "-f", "/var/log/wtmp")
		output, err := cmd.CombinedOutput()
		if err != nil {
			if writeErr := WriteNotFound(outputPath, "wtmp not readable"); writeErr != nil {
				return writeErr
			}
			return NewWarningError("wtmp not readable")
		}
		maxLines, _ := GetMaxLines(params)
		maxSize, _ := GetMaxSizeMB(params)
		output = LimitOutput(output, maxLines, maxSize)
		return WriteOutput(outputPath, output)
	}
	return nil
}

func (m *LinuxBtmp) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	if _, err := exec.LookPath("last"); err != nil {
		note := "last command not available"
		if writeErr := WriteNotFound(outputPath, note); writeErr != nil {
			return writeErr
		}
		return NewWarningError(note)
	}
	cmd := exec.CommandContext(ctx, "last", "-f", "/var/log/btmp")
	output, err := cmd.CombinedOutput()
	if err != nil {
		if writeErr := WriteNotFound(outputPath, "btmp not readable"); writeErr != nil {
			return writeErr
		}
		return NewWarningError("btmp not readable")
	}
	maxLines, _ := GetMaxLines(params)
	maxSize, _ := GetMaxSizeMB(params)
	output = LimitOutput(output, maxLines, maxSize)
	return WriteOutput(outputPath, output)
}
