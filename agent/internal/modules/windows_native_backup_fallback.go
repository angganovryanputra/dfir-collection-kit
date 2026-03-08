//go:build !windows
// +build !windows

package modules

import (
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
)

// CopyFileNativeBackup provides a fallback for non-Windows platforms to allow compilation.
func CopyFileNativeBackup(ctx context.Context, srcPath, dstPath string) error {
	if err := os.MkdirAll(filepath.Dir(dstPath), 0755); err != nil {
		return err
	}

	srcFile, err := os.Open(srcPath)
	if err != nil {
		return fmt.Errorf("fallback open failed for %s: %w", srcPath, err)
	}
	defer srcFile.Close()

	dstFile, err := os.Create(dstPath)
	if err != nil {
		return fmt.Errorf("fallback create failed for %s: %w", dstPath, err)
	}
	defer func() {
		dstFile.Close()
		if ctx.Err() != nil {
			os.Remove(dstPath)
		}
	}()

	buf := make([]byte, 1024*1024)
	for {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		n, err := srcFile.Read(buf)
		if n > 0 {
			if _, werr := dstFile.Write(buf[:n]); werr != nil {
				return werr
			}
		}
		if err == io.EOF {
			break
		}
		if err != nil {
			return err
		}
	}
	return nil
}
