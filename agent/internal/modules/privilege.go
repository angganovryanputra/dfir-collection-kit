package modules

// IsAdmin returns true if the current process has administrative or root privileges.
func IsAdmin() bool {
	return isAdminOS()
}
