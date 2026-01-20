package modules

import (
	"bytes"
	"context"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"time"
)

func IsAdmin() bool {
	if runtime.GOOS == "windows" {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		cmd := exec.CommandContext(ctx, "powershell.exe", "-NoProfile", "-Command", "[bool]([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)")
		out, err := cmd.CombinedOutput()
		if err != nil {
			return false
		}
		value := strings.TrimSpace(string(bytes.ToLower(out)))
		return value == "true"
	}

	if runtime.GOOS == "linux" {
		return os.Geteuid() == 0
	}

	return false
}
