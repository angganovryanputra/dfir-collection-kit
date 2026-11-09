package modules

import (
	"context"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func TestLinuxMemoryAcquisition_NoAVML_SafeAbort(t *testing.T) {
	origLookPath := lookPath
	origStatPath := statPath
	origOS := currentOS
	t.Cleanup(func() {
		lookPath = origLookPath
		statPath = origStatPath
		currentOS = origOS
	})

	// Force avml and lime to be missing
	lookPath = func(file string) (string, error) {
		return "", exec.ErrNotFound
	}
	statPath = func(name string) (os.FileInfo, error) {
		return nil, os.ErrNotExist
	}

	tmpDir := t.TempDir()
	outPath := filepath.Join(tmpDir, "memory.raw")

	ctx := context.Background()
	// Force avml and lime to be missing
	err := LinuxMemoryAcquisition(ctx, outPath, false, nil)
	// Must return a structured error or nil, but MUST NOT create a 128TB file
	if err == nil {
		t.Log("Memory acquisition completed (AVML present)")
	} else {
		t.Logf("Safely returned error: %v", err)
	}

	if !IsWarning(err) {
		t.Fatalf("expected WarningError, got: %v", err)
	}

	expectedMsg := "linux_memory_acquisition: AVML or LiME driver required for physical memory capture on Linux; /proc/kcore sequential read skipped to prevent host crash"
	if !strings.Contains(err.Error(), expectedMsg) {
		t.Fatalf("expected error containing %q, got %q", expectedMsg, err.Error())
	}

	fi, statErr := os.Stat(outPath)
	if statErr == nil && fi.Size() > 1024*1024*64 { // 64 MB
		t.Fatalf("Memory dump file unexpectedly large: %d bytes", fi.Size())
	}
}

func TestLinuxMemoryAcquisition_AVMLSuccess(t *testing.T) {
	origLookPath := lookPath
	origRunCmd := runCommand
	t.Cleanup(func() {
		lookPath = origLookPath
		runCommand = origRunCmd
	})

	tmpDir := t.TempDir()
	outPath := filepath.Join(tmpDir, "memory.raw")

	lookPath = func(file string) (string, error) {
		if file == "avml" {
			return "/usr/bin/avml", nil
		}
		return "", exec.ErrNotFound
	}

	runCommand = func(ctx context.Context, name string, args ...string) error {
		if name == "/usr/bin/avml" {
			// Simulate avml writing a valid memory capture
			return os.WriteFile(args[0], []byte("AVML_DUMP_HEADER"), 0644)
		}
		return errors.New("unexpected command")
	}

	ctx := context.Background()
	err := LinuxMemoryAcquisition(ctx, outPath, false, nil)
	if err != nil {
		t.Fatalf("expected nil error on AVML success, got: %v", err)
	}

	data, err := os.ReadFile(outPath)
	if err != nil {
		t.Fatalf("failed to read output file: %v", err)
	}
	if string(data) != "AVML_DUMP_HEADER" {
		t.Fatalf("unexpected content in output file: %q", string(data))
	}
}

func TestLinuxMemoryAcquisition_AVMLFails_FallsBackToLiME(t *testing.T) {
	origLookPath := lookPath
	origStatPath := statPath
	origOpenFile := openFile
	origRunCmd := runCommand
	t.Cleanup(func() {
		lookPath = origLookPath
		statPath = origStatPath
		openFile = origOpenFile
		runCommand = origRunCmd
	})

	tmpDir := t.TempDir()
	outPath := filepath.Join(tmpDir, "memory.raw")
	mockLimeFile := filepath.Join(tmpDir, "lime_device")
	if err := os.WriteFile(mockLimeFile, []byte("LIME_RAW_MEMORY_IMAGE"), 0644); err != nil {
		t.Fatalf("failed to create mock lime file: %v", err)
	}

	// AVML exists in PATH but command execution fails
	lookPath = func(file string) (string, error) {
		if file == "avml" {
			return "/usr/bin/avml", nil
		}
		return "", exec.ErrNotFound
	}
	runCommand = func(ctx context.Context, name string, args ...string) error {
		return errors.New("avml failed to attach to memory")
	}

	// LiME is available
	statPath = func(name string) (os.FileInfo, error) {
		if name == "/proc/lime" {
			return os.Stat(mockLimeFile)
		}
		return nil, os.ErrNotExist
	}
	openFile = func(name string) (*os.File, error) {
		if name == "/proc/lime" {
			return os.Open(mockLimeFile)
		}
		return nil, os.ErrNotExist
	}

	ctx := context.Background()
	err := LinuxMemoryAcquisition(ctx, outPath, false, nil)
	if err != nil {
		t.Fatalf("expected nil error when LiME fallback succeeds, got: %v", err)
	}

	data, err := os.ReadFile(outPath)
	if err != nil {
		t.Fatalf("failed to read output file: %v", err)
	}
	if string(data) != "LIME_RAW_MEMORY_IMAGE" {
		t.Fatalf("unexpected content in output file: %q", string(data))
	}
}

func TestLinuxMemoryAcquisition_BothFail_SafeAbort(t *testing.T) {
	origLookPath := lookPath
	origStatPath := statPath
	origOpenFile := openFile
	origRunCmd := runCommand
	t.Cleanup(func() {
		lookPath = origLookPath
		statPath = origStatPath
		openFile = origOpenFile
		runCommand = origRunCmd
	})

	tmpDir := t.TempDir()
	outPath := filepath.Join(tmpDir, "memory.raw")

	// AVML exists but fails
	lookPath = func(file string) (string, error) {
		if file == "avml" {
			return "/usr/bin/avml", nil
		}
		return "", exec.ErrNotFound
	}
	runCommand = func(ctx context.Context, name string, args ...string) error {
		return errors.New("avml crashed")
	}

	// LiME stat succeeds but open fails
	statPath = func(name string) (os.FileInfo, error) {
		if name == "/proc/lime" {
			return nil, nil
		}
		return nil, os.ErrNotExist
	}
	openFile = func(name string) (*os.File, error) {
		return nil, os.ErrPermission
	}

	ctx := context.Background()
	err := LinuxMemoryAcquisition(ctx, outPath, false, nil)
	if err == nil {
		t.Fatalf("expected warning error when both AVML and LiME fail, got nil")
	}
	if !IsWarning(err) {
		t.Fatalf("expected WarningError, got: %v", err)
	}
	if _, statErr := os.Stat(outPath); statErr == nil {
		t.Fatalf("expected output file to be removed after failure, but it exists")
	}
}

func TestLinuxMemoryAcquisitionModule_Run(t *testing.T) {
	origOS := currentOS
	origLookPath := lookPath
	origStatPath := statPath
	t.Cleanup(func() {
		currentOS = origOS
		lookPath = origLookPath
		statPath = origStatPath
	})

	mod := NewLinuxMemoryAcquisition()
	if mod.ID() != "linux_memory_acquisition" {
		t.Fatalf("unexpected module ID: %s", mod.ID())
	}
	if mod.OutputRelPath() != "volatile/linux/memory.raw" {
		t.Fatalf("unexpected output rel path: %s", mod.OutputRelPath())
	}

	tmpDir := t.TempDir()
	outPath := filepath.Join(tmpDir, "mem.raw")
	ctx := context.Background()
	mctx := ModuleContext{}

	// On non-Linux OS, Run returns warning
	currentOS = "windows"
	err := mod.Run(ctx, mctx, nil, outPath)
	if err == nil || !IsWarning(err) || !strings.Contains(err.Error(), "only supported on Linux") {
		t.Fatalf("expected non-linux warning, got: %v", err)
	}

	// On Linux without AVML/LiME, Run returns the safe abort warning
	currentOS = "linux"
	lookPath = func(file string) (string, error) { return "", exec.ErrNotFound }
	statPath = func(name string) (os.FileInfo, error) { return nil, os.ErrNotExist }

	err = mod.Run(ctx, mctx, nil, outPath)
	if err == nil || !IsWarning(err) || !strings.Contains(err.Error(), "AVML or LiME driver required") {
		t.Fatalf("expected safe abort warning on Linux, got: %v", err)
	}
}
