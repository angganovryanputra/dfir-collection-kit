package modules

import (
	"context"
	"io"
	"os"
	"os/exec"
	"runtime"
)

// Internal hook variables for testing and mocking system interactions.
var (
	lookPath   = exec.LookPath
	statPath   = os.Stat
	openFile   = os.Open
	runCommand = func(ctx context.Context, name string, args ...string) error {
		return exec.CommandContext(ctx, name, args...).Run()
	}
	currentOS = runtime.GOOS
)

// LinuxMemoryAcquisitionModule captures physical memory using AVML or LiME.
type LinuxMemoryAcquisitionModule struct {
	Module
}

// NewLinuxMemoryAcquisition creates a new Linux memory acquisition module.
func NewLinuxMemoryAcquisition() *LinuxMemoryAcquisitionModule {
	return &LinuxMemoryAcquisitionModule{
		Module: NewModule("linux_memory_acquisition", "volatile/linux/memory.raw"),
	}
}

// Run acquires physical memory on Linux via AVML (preferred) or LiME.
// Unbounded sequential copying of /proc/kcore is deliberately omitted to prevent host crash and 128TB disk exhaustion.
func (m *LinuxMemoryAcquisitionModule) Run(
	ctx context.Context,
	mctx ModuleContext,
	params map[string]interface{},
	outputPath string,
) error {
	if currentOS != "linux" {
		return NewWarningError("linux_memory_acquisition: only supported on Linux")
	}
	return LinuxMemoryAcquisition(ctx, outputPath, false, params)
}

// LinuxMemoryAcquisition captures physical memory using AVML or LiME.
// Unbounded sequential copying of /proc/kcore is disabled to prevent host crashes and 128TB disk exhaustion.
func LinuxMemoryAcquisition(
	ctx context.Context,
	outputPath string,
	allowKcore bool,
	params map[string]interface{},
) error {
	if err := EnsureOutputDir(outputPath); err != nil {
		return err
	}

	// 1. Prefer AVML: statically linked, no kernel module required.
	if avmlPath, err := lookPath("avml"); err == nil {
		if runErr := runCommand(ctx, avmlPath, outputPath); runErr == nil {
			return nil
		}
		_ = os.Remove(outputPath)
	}

	// 2. Check for LiME driver
	if _, err := statPath("/proc/lime"); err == nil {
		if err := copyLime(outputPath); err == nil {
			return nil
		}
		_ = os.Remove(outputPath)
	}

	// 3. Fallback safeguard: Do NOT sequential-copy /proc/kcore without an ELF segment parser
	return NewWarningError("linux_memory_acquisition: AVML or LiME driver required for physical memory capture on Linux; /proc/kcore sequential read skipped to prevent host crash")
}

func copyLime(outputPath string) error {
	src, err := openFile("/proc/lime")
	if err != nil {
		return err
	}
	defer src.Close()

	dst, err := os.Create(outputPath)
	if err != nil {
		return err
	}
	defer dst.Close()

	if _, err := io.Copy(dst, src); err != nil {
		return err
	}
	return nil
}
