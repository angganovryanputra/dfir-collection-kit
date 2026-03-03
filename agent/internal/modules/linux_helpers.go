package modules

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

func runCommandToFile(ctx context.Context, outputPath string, params map[string]interface{}, name string, args ...string) error {
	cmd := exec.CommandContext(ctx, name, args...)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("%s failed: %w", name, err)
	}
	maxLines, _ := GetMaxLines(params)
	maxSize, _ := GetMaxSizeMB(params)
	output = LimitOutput(output, maxLines, maxSize)
	return WriteOutput(outputPath, output)
}

func readFirstExisting(paths []string) ([]byte, string, error) {
	for _, path := range paths {
		if data, err := os.ReadFile(path); err == nil {
			return data, path, nil
		}
	}
	return nil, "", fmt.Errorf("no readable paths found")
}

func copyIfExists(outputPath string, sourcePath string) error {
	data, err := os.ReadFile(sourcePath)
	if err != nil {
		if os.IsNotExist(err) {
			if writeErr := WriteNotFound(outputPath, sourcePath); writeErr != nil {
				return writeErr
			}
			return NewWarningError("missing: " + sourcePath)
		}
		return err
	}
	return WriteOutput(outputPath, data)
}

func listAuthorizedKeys() []string {
	var results []string
	paths, _ := filepath.Glob("/home/*/.ssh/authorized_keys")
	results = append(results, paths...)
	if _, err := os.Stat("/root/.ssh/authorized_keys"); err == nil {
		results = append(results, "/root/.ssh/authorized_keys")
	}
	return results
}

func listBashHistories() []string {
	var results []string
	paths, _ := filepath.Glob("/home/*/.bash_history")
	results = append(results, paths...)
	if _, err := os.Stat("/root/.bash_history"); err == nil {
		results = append(results, "/root/.bash_history")
	}
	return results
}

func formatMultiFileContent(title string, filePath string, content []byte) []byte {
	header := fmt.Sprintf("[%s] %s\n", title, filePath)
	return append([]byte(header), content...)
}

func addSeparator(content []byte) []byte {
	return append(content, []byte("\n----\n")...)
}

func sanitizeFileName(name string) string {
	clean := strings.ReplaceAll(name, "/", "_")
	return strings.ReplaceAll(clean, "..", "_")
}
