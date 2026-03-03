package modules

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// copyWithRobocopy copies files matching pattern from srcDir to dstDir using robocopy /B (Backup mode).
// Backup mode uses SeBackupPrivilege to access locked/system files without exclusive file handles.
// Robocopy exit codes: 0=no copy needed, 1=files copied OK, 2-7=warnings, >=8=errors.
func copyWithRobocopy(ctx context.Context, srcDir, pattern, dstDir string) error {
	if err := os.MkdirAll(dstDir, 0755); err != nil {
		return fmt.Errorf("failed to create dest dir %s: %w", dstDir, err)
	}
	cmd := exec.CommandContext(ctx, "robocopy", srcDir, dstDir, pattern,
		"/B",   // Backup mode (SeBackupPrivilege)
		"/NJH", // No job header
		"/NJS", // No job summary
		"/NFL", // No file list
		"/NDL", // No directory list
		"/NC",  // No file classes
		"/NS",  // No file sizes
	)
	if err := cmd.Run(); err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			if exitErr.ExitCode() < 8 {
				return nil // exit codes 0-7 are informational
			}
		}
		return fmt.Errorf("robocopy failed copying %s\\%s: %w", srcDir, pattern, err)
	}
	return nil
}

// copyWithRobocopyRecursive recursively copies srcDir tree into dstDir using Backup mode.
func copyWithRobocopyRecursive(ctx context.Context, srcDir, dstDir string) error {
	if err := os.MkdirAll(dstDir, 0755); err != nil {
		return fmt.Errorf("failed to create dest dir %s: %w", dstDir, err)
	}
	cmd := exec.CommandContext(ctx, "robocopy", srcDir, dstDir, "*",
		"/E",   // Copy subdirectories including empty ones
		"/B",   // Backup mode
		"/NJH", "/NJS", "/NFL", "/NDL", "/NC", "/NS",
	)
	if err := cmd.Run(); err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			if exitErr.ExitCode() < 8 {
				return nil
			}
		}
		return fmt.Errorf("robocopy recursive failed for %s: %w", srcDir, err)
	}
	return nil
}

// getUserProfileDirs returns full paths of user home directories under C:\Users,
// excluding system accounts (Public, Default, Default User, All Users).
func getUserProfileDirs(ctx context.Context) ([]string, error) {
	cmd := exec.CommandContext(ctx, "powershell.exe", "-NoProfile", "-Command",
		`Get-ChildItem 'C:\Users' -Directory | Where-Object { $_.Name -notmatch '^(Public|Default|Default User|All Users)$' } | Select-Object -ExpandProperty FullName`)
	output, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("failed to enumerate user profiles: %w", err)
	}
	var dirs []string
	for _, line := range strings.Split(strings.TrimSpace(string(output)), "\n") {
		line = strings.TrimRight(strings.TrimSpace(line), "\r")
		if line != "" {
			dirs = append(dirs, line)
		}
	}
	return dirs, nil
}

// profileName returns the username portion of a profile directory path.
func profileName(profileDir string) string {
	return filepath.Base(profileDir)
}

// writeErrors writes a multi-line error summary to a file without aborting the module.
func writeErrors(outputDir string, errs []string) {
	if len(errs) == 0 {
		return
	}
	_ = os.MkdirAll(outputDir, 0755)
	_ = os.WriteFile(filepath.Join(outputDir, "errors.txt"), []byte(strings.Join(errs, "\n")), 0644)
}
