package modules

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
)

// WindowsMemoryAcquisitionModule captures a raw physical memory image using WinPmem.
type WindowsMemoryAcquisitionModule struct {
	Module
}

// NewWindowsMemoryAcquisition creates a new Windows memory acquisition module.
func NewWindowsMemoryAcquisition() *WindowsMemoryAcquisitionModule {
	return &WindowsMemoryAcquisitionModule{
		Module: NewModule("windows_memory_acquisition", "volatile/windows/memory.raw"),
	}
}

// Run acquires physical memory via WinPmem. Requires Administrator privileges.
func (m *WindowsMemoryAcquisitionModule) Run(
	ctx context.Context,
	mctx ModuleContext,
	params map[string]interface{},
	outputPath string,
) error {
	if runtime.GOOS != "windows" {
		return NewWarningError("windows_memory_acquisition: only supported on Windows")
	}
	if !mctx.IsAdmin {
		return NewWarningError("windows_memory_acquisition: requires Administrator privileges")
	}
	if err := EnsureOutputDir(outputPath); err != nil {
		return err
	}

	winpmem, err := findWinPmem()
	if err != nil {
		return NewWarningError(
			"WinPmem not found. Download from https://github.com/Velocidex/WinPmem/releases " +
				"and place winpmem_mini_x64.exe in PATH or C:\\Tools\\WinPmem\\. Error: " + err.Error(),
		)
	}

	cmd := exec.CommandContext(ctx, winpmem, outputPath)
	out, runErr := cmd.CombinedOutput()
	if runErr != nil {
		_ = os.Remove(outputPath)
		outLen := min(500, len(out))
		return fmt.Errorf("winpmem failed: %w\nOutput: %s", runErr, string(out[:outLen]))
	}
	return nil
}

// findWinPmem searches PATH and common installation directories for a WinPmem binary.
func findWinPmem() (string, error) {
	for _, name := range []string{"winpmem_mini_x64.exe", "winpmem_mini_x86.exe", "winpmem.exe"} {
		if path, err := exec.LookPath(name); err == nil {
			return path, nil
		}
	}

	candidates := []string{
		`C:\Tools\WinPmem\winpmem_mini_x64.exe`,
		`C:\Tools\WinPmem\winpmem.exe`,
		`C:\Tools\winpmem.exe`,
	}
	if pf := os.Getenv("ProgramFiles"); pf != "" {
		candidates = append(candidates, filepath.Join(pf, "WinPmem", "winpmem_mini_x64.exe"))
	}
	for _, c := range candidates {
		if _, err := os.Stat(c); err == nil {
			return c, nil
		}
	}
	return "", fmt.Errorf("not found in PATH or common locations")
}
