package modules

import (
	"context"
	"fmt"
	"io"
	"os"
	"os/exec"
	"runtime"
)

// LinuxMemoryAcquisitionModule captures physical memory using AVML or /proc/kcore as fallback.
type LinuxMemoryAcquisitionModule struct {
	Module
}

// NewLinuxMemoryAcquisition creates a new Linux memory acquisition module.
func NewLinuxMemoryAcquisition() *LinuxMemoryAcquisitionModule {
	return &LinuxMemoryAcquisitionModule{
		Module: NewModule("linux_memory_acquisition", "volatile/linux/memory.raw"),
	}
}

// Run acquires physical memory via AVML (preferred) or /proc/kcore (fallback).
// AVML requires no kernel module and produces a LiME-compatible image.
// /proc/kcore is an ELF core of the kernel's virtual address space and requires root.
func (m *LinuxMemoryAcquisitionModule) Run(
	ctx context.Context,
	mctx ModuleContext,
	params map[string]interface{},
	outputPath string,
) error {
	if runtime.GOOS != "linux" {
		return NewWarningError("linux_memory_acquisition: only supported on Linux")
	}
	if err := EnsureOutputDir(outputPath); err != nil {
		return err
	}

	// Prefer AVML: statically linked, no kernel module required.
	if avml, err := exec.LookPath("avml"); err == nil {
		cmd := exec.CommandContext(ctx, avml, outputPath)
		out, runErr := cmd.CombinedOutput()
		if runErr != nil {
			_ = os.Remove(outputPath)
			outLen := min(500, len(out))
			return fmt.Errorf("avml failed: %w — %s", runErr, string(out[:outLen]))
		}
		return nil
	}

	// Fallback: /proc/kcore — ELF core of kernel virtual address space.
	const kcore = "/proc/kcore"
	if _, err := os.Stat(kcore); err != nil {
		return NewWarningError(
			"linux_memory_acquisition: neither AVML nor /proc/kcore is available. " +
				"Install AVML from https://github.com/microsoft/avml/releases or run the agent as root.",
		)
	}

	src, err := os.Open(kcore)
	if err != nil {
		return NewWarningError(
			fmt.Sprintf("linux_memory_acquisition: cannot open %s: %v — run agent as root.", kcore, err),
		)
	}
	defer src.Close()

	dst, err := os.Create(outputPath)
	if err != nil {
		return fmt.Errorf("linux_memory_acquisition: cannot create output file: %w", err)
	}
	defer dst.Close()

	if _, copyErr := io.Copy(dst, src); copyErr != nil {
		_ = os.Remove(outputPath)
		return fmt.Errorf("linux_memory_acquisition: memory copy failed: %w", copyErr)
	}
	return nil
}
