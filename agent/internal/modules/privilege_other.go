//go:build !windows

package modules

import "os"

func isAdminOS() bool {
	return os.Geteuid() == 0
}
