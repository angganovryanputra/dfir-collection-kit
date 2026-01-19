package modules

import (
	"bufio"
	"context"
	"fmt"
	"os/exec"
	"path/filepath"
	"runtime"

	"github.com/dfir/agent/internal/logging"
)

// LinuxProcessList collects running processes on Linux
type LinuxProcessList struct {
	Module
}

func (m *LinuxProcessList) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	logging.WithJob(mctx.JobID).Info("Collecting process list")

	// Use ps command to get process list
	cmd := exec.CommandContext(ctx, "ps", "aux", "--sort", "-pcpu", "--no-headers")

	if output, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("ps command failed: %w", err)
	}

	if err := os.WriteFile(outputPath, []byte(output), 0644); err != nil {
		return fmt.Errorf("failed to write process list: %w", err)
	}

	logging.WithJob(mctx.JobID).Info("Process list collected")
	return nil
}

func (m *LinuxProcessList) ID() string { return "linux_process_list" }

// LinuxNetworkConnections collects network connections on Linux
type LinuxNetworkConnections struct {
	Module
}

func (m *LinuxNetworkConnections) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	logging.WithJob(mctx.JobID).Info("Collecting network connections")

	// Use ss command to get TCP connections
	cmd := exec.CommandContext(ctx, "ss", "-tupn", "-o", "state=established")

	if output, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("ss command failed: %w", err)
	}

	if err := os.WriteFile(outputPath, []byte(output), 0644); err != nil {
		return fmt.Errorf("failed to write network connections: %w", err)
	}

	logging.WithJob(mctx.JobID).Info("Network connections collected")
	return nil
}

func (m *LinuxNetworkConnections) ID() string { return "linux_network_connections" }

// LinuxSyslogRecent collects recent system logs
type LinuxSyslogRecent struct {
	Module
}

func (m *LinuxSyslogRecent) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	logging.WithJob(mctx.JobID).Info("Collecting system logs")

	// Check for common syslog locations
	syslogPaths := []string{
		"/var/log/syslog",
		"/var/log/messages",
	}

	var content []byte
	for _, path := range syslogPaths {
		if data, err := os.ReadFile(path); err == nil {
			content = append(content, data...)
			break
		}
	}

	if len(content) == 0 {
		logging.WithJob(mctx.JobID).Warning("No system log files found")
		return nil
	}

	if err := os.WriteFile(outputPath, content, 0644); err != nil {
		return fmt.Errorf("failed to write system logs: %w", err)
	}

	logging.WithJob(mctx.JobID).Info("System logs collected")
	return nil
}

func (m *LinuxSyslogRecent) ID() string { return "linux_syslog_recent" }

// LinuxAuthLogs collects authentication logs
type LinuxAuthLogs struct {
	Module
}

func (m *LinuxAuthLogs) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	logging.WithJob(mctx.JobID).Info("Collecting authentication logs")

	// Check for common auth log locations
	authLogPaths := []string{
		"/var/log/auth.log",
		"/var/log/secure",
	}

	var content []byte
	for _, path := range authLogPaths {
		if data, err := os.ReadFile(path); err == nil {
			content = append(content, data...)
			break
		}
	}

	if len(content) == 0 {
		logging.WithJob(mctx.JobID).Warning("No authentication log files found")
		return nil
	}

	if err := os.WriteFile(outputPath, content, 0644); err != nil {
		return fmt.Errorf("failed to write authentication logs: %w", err)
	}

	logging.WithJob(mctx.JobID).Info("Authentication logs collected")
	return nil
}

func (m *LinuxAuthLogs) ID() string { return "linux_auth_logs" }

// LinuxCronJobs collects cron jobs and scheduled tasks
type LinuxCronJobs struct {
	Module
}

func (m *LinuxCronJobs) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	logging.WithJob(mctx.JobID).Info("Collecting cron jobs")

	// Get user crontab entries
	cmd := exec.CommandContext(ctx, "crontab", "-l")

	if output, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("crontab command failed: %w", err)
	}

	if err := os.WriteFile(outputPath, []byte(output), 0644); err != nil {
		return fmt.Errorf("failed to write cron jobs: %w", err)
	}

	logging.WithJob(mctx.JobID).Info("Cron jobs collected")
	return nil
}

func (m *LinuxCronJobs) ID() string { return "linux_cron_jobs" }

// LinuxLoggedInUsers collects logged-in user sessions
type LinuxLoggedInUsers struct {
	Module
}

func (m *LinuxLoggedInUsers) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	logging.WithJob(mctx.JobID).Info("Collecting logged-in users")

	// Use who command to get logged-in users
	cmd := exec.CommandContext(ctx, "who")

	if output, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("who command failed: %w", err)
	}

	if err := os.WriteFile(outputPath, []byte(output), 0644); err != nil {
		return fmt.Errorf("failed to write logged-in users: %w", err)
	}

	logging.WithJob(mctx.JobID).Info("Logged-in users collected")
	return nil
}

func (m *LinuxLoggedInUsers) ID() string { return "linux_logged_in_users" }
