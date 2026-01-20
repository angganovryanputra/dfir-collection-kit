package storage

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/dfir/agent/internal/logging"
)

// CreateWorkDir creates the work directory for a job
func CreateWorkDir(workDir string) error {
	logging.Debug("Creating work directory: %s", workDir)

	if err := os.MkdirAll(workDir, 0755); err != nil && !os.IsExist(err) {
		return fmt.Errorf("failed to create work directory: %w", err)
	}

	return nil
}

// Cleanup removes the work directory for a job
func Cleanup(workDir string) error {
	logging.Debug("Cleaning up work directory: %s", workDir)

	if err := os.RemoveAll(workDir); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("failed to clean up work directory: %w", err)
	}

	return nil
}

// GetWorkDir returns the OS-specific work directory path
func GetWorkDir(basePath, jobID string) string {
	if basePath == "" {
		return filepath.Join(".", jobID)
	}
	return filepath.Join(basePath, jobID)
}

// SafeJoin ensures a relative path stays within the work directory.
func SafeJoin(workDir, relPath string) (string, error) {
	if relPath == "" {
		return "", fmt.Errorf("empty output path")
	}
	if filepath.IsAbs(relPath) {
		return "", fmt.Errorf("absolute output path not allowed: %s", relPath)
	}
	cleanRel := filepath.Clean(relPath)
	if cleanRel == "." || cleanRel == ".." || strings.HasPrefix(cleanRel, ".."+string(os.PathSeparator)) {
		return "", fmt.Errorf("invalid output path: %s", relPath)
	}
	fullPath := filepath.Join(workDir, cleanRel)
	rel, err := filepath.Rel(workDir, fullPath)
	if err != nil {
		return "", fmt.Errorf("path validation failed: %w", err)
	}
	if rel == ".." || strings.HasPrefix(rel, ".."+string(os.PathSeparator)) {
		return "", fmt.Errorf("output path escapes workdir: %s", relPath)
	}
	return fullPath, nil
}
