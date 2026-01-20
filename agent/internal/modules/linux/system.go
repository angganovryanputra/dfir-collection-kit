package modules

import (
	"context"
	"fmt"
	"os"
	"os/exec"
)

type LinuxProcessList struct {
	Module
}

type LinuxNetworkConnections struct {
	Module
}

type LinuxIpConfig struct {
	Module
}

type LinuxResolvConf struct {
	Module
}

type LinuxBashHistory struct {
	Module
}

type LinuxLoggedInUsers struct {
	Module
}

type LinuxPackages struct {
	Module
}

type LinuxKernelVersion struct {
	Module
}

func NewLinuxProcessList() *LinuxProcessList {
	return &LinuxProcessList{Module: NewModule("linux_process_list", "volatile/linux/process_list.txt")}
}

func NewLinuxNetworkConnections() *LinuxNetworkConnections {
	return &LinuxNetworkConnections{Module: NewModule("linux_network_connections", "volatile/linux/network_connections.txt")}
}

func NewLinuxIpConfig() *LinuxIpConfig {
	return &LinuxIpConfig{Module: NewModule("linux_ip_config", "system/linux/ip_config.txt")}
}

func NewLinuxResolvConf() *LinuxResolvConf {
	return &LinuxResolvConf{Module: NewModule("linux_resolv_conf", "system/linux/resolv.conf")}
}

func NewLinuxBashHistory() *LinuxBashHistory {
	return &LinuxBashHistory{Module: NewModule("linux_bash_history", "system/linux/bash_history.txt")}
}

func NewLinuxLoggedInUsers() *LinuxLoggedInUsers {
	return &LinuxLoggedInUsers{Module: NewModule("linux_logged_in_users", "system/linux/logged_in_users.txt")}
}

func NewLinuxPackages() *LinuxPackages {
	return &LinuxPackages{Module: NewModule("linux_installed_packages", "system/linux/installed_packages.txt")}
}

func NewLinuxKernelVersion() *LinuxKernelVersion {
	return &LinuxKernelVersion{Module: NewModule("linux_kernel_version", "system/linux/kernel_version.txt")}
}

func (m *LinuxProcessList) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	return runCommandToFile(ctx, outputPath, params, "ps", "aux", "--sort", "-pcpu")
}

func (m *LinuxNetworkConnections) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	if _, err := exec.LookPath("ss"); err == nil {
		return runCommandToFile(ctx, outputPath, params, "ss", "-tupn")
	}
	if _, err := exec.LookPath("netstat"); err == nil {
		return runCommandToFile(ctx, outputPath, params, "netstat", "-tupn")
	}
	note := "no ss/netstat available"
	if writeErr := WriteNotFound(outputPath, note); writeErr != nil {
		return writeErr
	}
	return NewWarningError(note)
}

func (m *LinuxIpConfig) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	if _, err := exec.LookPath("ip"); err != nil {
		note := "ip command not available"
		if writeErr := WriteNotFound(outputPath, note); writeErr != nil {
			return writeErr
		}
		return NewWarningError(note)
	}
	cmd := exec.CommandContext(ctx, "ip", "addr")
	addrOutput, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("ip addr failed: %w", err)
	}
	cmd = exec.CommandContext(ctx, "ip", "route")
	routeOutput, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("ip route failed: %w", err)
	}
	combined := append([]byte("[ip addr]\n"), addrOutput...)
	combined = addSeparator(combined)
	combined = append(combined, []byte("[ip route]\n")...)
	combined = append(combined, routeOutput...)
	maxLines, _ := GetMaxLines(params)
	maxSize, _ := GetMaxSizeMB(params)
	combined = LimitOutput(combined, maxLines, maxSize)
	return WriteOutput(outputPath, combined)
}

func (m *LinuxResolvConf) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	return copyIfExists(outputPath, "/etc/resolv.conf")
}

func (m *LinuxBashHistory) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	paths := listBashHistories()
	if len(paths) == 0 {
		if writeErr := WriteNotFound(outputPath, "bash_history not found"); writeErr != nil {
			return writeErr
		}
		return NewWarningError("bash_history not found")
	}
	var combined []byte
	for _, path := range paths {
		data, err := os.ReadFile(path)
		if err != nil {
			combined = append(combined, []byte(fmt.Sprintf("[%s] not readable\n", path))...)
			combined = addSeparator(combined)
			continue
		}
		combined = append(combined, formatMultiFileContent("bash_history", path, data)...)
		combined = addSeparator(combined)
	}
	maxLines, _ := GetMaxLines(params)
	maxSize, _ := GetMaxSizeMB(params)
	combined = LimitOutput(combined, maxLines, maxSize)
	return WriteOutput(outputPath, combined)
}

func (m *LinuxLoggedInUsers) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	var combined []byte
	commands := [][]string{{"who"}, {"w"}, {"last"}}
	for _, cmdArgs := range commands {
		cmd := exec.CommandContext(ctx, cmdArgs[0], cmdArgs[1:]...)
		output, err := cmd.CombinedOutput()
		if err != nil {
			combined = append(combined, []byte(fmt.Sprintf("[%s] failed: %v\n", cmdArgs[0], err))...)
			combined = addSeparator(combined)
			continue
		}
		combined = append(combined, []byte(fmt.Sprintf("[%s]\n", cmdArgs[0]))...)
		combined = append(combined, output...)
		combined = addSeparator(combined)
	}
	maxLines, _ := GetMaxLines(params)
	maxSize, _ := GetMaxSizeMB(params)
	combined = LimitOutput(combined, maxLines, maxSize)
	return WriteOutput(outputPath, combined)
}

func (m *LinuxPackages) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	if _, err := exec.LookPath("dpkg-query"); err == nil {
		return runCommandToFile(ctx, outputPath, params, "dpkg-query", "-W", "-f", "${Package}\t${Version}\n")
	}
	if _, err := exec.LookPath("rpm"); err == nil {
		return runCommandToFile(ctx, outputPath, params, "rpm", "-qa")
	}
	note := "no dpkg-query or rpm available"
	if writeErr := WriteNotFound(outputPath, note); writeErr != nil {
		return writeErr
	}
	return NewWarningError(note)
}

func (m *LinuxKernelVersion) Run(ctx context.Context, mctx ModuleContext, params map[string]interface{}, outputPath string) error {
	cmd := exec.CommandContext(ctx, "uname", "-a")
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("uname failed: %w", err)
	}
	return WriteOutput(outputPath, output)
}
