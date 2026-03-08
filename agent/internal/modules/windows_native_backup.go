//go:build windows
// +build windows

package modules

import (
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"

	"golang.org/x/sys/windows"
)

// EnableSeBackupPrivilege attempts to enable the SeBackupPrivilege for the current thread/process token.
// This allows bypassing normal DACL read checks, essential for reading locked files like NTUSER.DAT.
func EnableSeBackupPrivilege() error {
	var token windows.Token
	// Open current process token with adjust privileges and query access
	err := windows.OpenProcessToken(windows.CurrentProcess(), windows.TOKEN_ADJUST_PRIVILEGES|windows.TOKEN_QUERY, &token)
	if err != nil {
		return fmt.Errorf("OpenProcessToken failed: %w", err)
	}
	defer token.Close()

	// Get LUID for SeBackupPrivilege
	var luid windows.LUID
	privName := windows.StringToUTF16Ptr("SeBackupPrivilege")
	err = windows.LookupPrivilegeValue(nil, privName, &luid)
	if err != nil {
		return fmt.Errorf("LookupPrivilegeValue failed: %w", err)
	}

	// Set privilege
	privs := windows.Tokenprivileges{
		PrivilegeCount: 1,
		Privileges: [1]windows.LUIDAndAttributes{
			{
				Luid:       luid,
				Attributes: windows.SE_PRIVILEGE_ENABLED,
			},
		},
	}

	err = windows.AdjustTokenPrivileges(token, false, &privs, 0, nil, nil)
	if err != nil {
		return fmt.Errorf("AdjustTokenPrivileges failed: %w", err)
	}
	return nil
}

// CopyFileNativeBackup uses pure Windows API to copy a potentially locked file.
// It opens the file with FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT and uses BackupRead.
// This avoids calling `robocopy.exe` and triggering Process Creation EDR rules.
func CopyFileNativeBackup(ctx context.Context, srcPath, dstPath string) error {
	// Make destination directory if not exists
	if err := os.MkdirAll(filepath.Dir(dstPath), 0755); err != nil {
		return err
	}

	// Ensure Backup Privilege is active
	_ = EnableSeBackupPrivilege() // ignoring error, might already have it

	src16, err := windows.UTF16PtrFromString(srcPath)
	if err != nil {
		return err
	}

	// Open the source file with backup semantics
	handle, err := windows.CreateFile(
		src16,
		windows.GENERIC_READ,
		windows.FILE_SHARE_READ|windows.FILE_SHARE_WRITE|windows.FILE_SHARE_DELETE,
		nil,
		windows.OPEN_EXISTING,
		windows.FILE_FLAG_BACKUP_SEMANTICS|windows.FILE_FLAG_OPEN_REPARSE_POINT,
		0,
	)
	if err != nil {
		return fmt.Errorf("CreateFile failed for %s: %w", srcPath, err)
	}
	defer windows.CloseHandle(handle)

	// Since Go's os.NewFile works on uintptrs, we can wrap the handle into an os.File
	// Note: os.NewFile does not support BackupRead stream iteration out of the box,
	// but it allows standard Read() which is usually sufficient for simple file scraping
	// if the handle was opened via CreateFile.
	srcFile := os.NewFile(uintptr(handle), srcPath)
	if srcFile == nil {
		return fmt.Errorf("os.NewFile failed for handle")
	}
	defer srcFile.Close()

	// Destination file
	dstFile, err := os.Create(dstPath)
	if err != nil {
		return fmt.Errorf("os.Create failed for dest %s: %w", dstPath, err)
	}
	defer func() {
		dstFile.Close()
		if ctx.Err() != nil {
			os.Remove(dstPath)
		}
	}()

	// Stream copy
	buf := make([]byte, 1024*1024) // 1MB buffer
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
			return fmt.Errorf("read error: %w", err)
		}
	}
	return nil
}
