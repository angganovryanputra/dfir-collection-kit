package storage

import (
	"fmt"
	"os"
	"path/filepath"

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
