package config

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
)

const (
	// Heartbeat interval in seconds
	DefaultHeartbeatInterval = 30
	// Poll interval in seconds
	DefaultPollInterval = 15
	// Filename for storing agent ID
	AgentIDFile = "agent_id.json"
	// Default backend API URL
	DefaultBackendURL = "http://localhost:8000/api/v1"
)

// Config holds all agent configuration
type Config struct {
	BackendURL         string
	AgentSharedSecret  string
	AgentID            string
	Hostname           string
	IPAddress          string
	Type               string
	OSVersion           string
	AgentVersion        string
	HeartbeatInterval int
	PollInterval       int
}

// Load reads configuration from environment variables and generates/loads agent ID
// Returns the agent configuration with a persistent agent ID
func Load() (*Config, error) {
	backendURL := os.Getenv("DFIR_BACKEND_URL")
	if backendURL == "" {
		backendURL = DefaultBackendURL
	}

	secret := os.Getenv("DFIR_AGENT_SECRET")
	if secret == "" {
		return nil, errors.New("DFIR_AGENT_SECRET environment variable is required")
	}

	// Load or generate agent ID
	agentID, err := loadOrGenerateAgentID()
	if err != nil {
		return nil, fmt.Errorf("failed to load agent ID: %w", err)
	}

	cfg := &Config{
		BackendURL:         backendURL,
		AgentSharedSecret:  secret,
		AgentID:            agentID,
		Hostname:           os.Getenv("DFIR_HOSTNAME"),
		IPAddress:          os.Getenv("DFIR_IP_ADDRESS"),
		Type:               os.Getenv("DFIR_TYPE"),
		OSVersion:           detectOSVersion(),
		AgentVersion:        "1.0.0",
		HeartbeatInterval: DefaultHeartbeatInterval,
		PollInterval:       DefaultPollInterval,
	}

	return cfg, nil
}

// loadOrGenerateAgentID loads an existing agent ID or generates a new one
// The agent ID is persisted to allow consistent re-registration across restarts
func loadOrGenerateAgentID() (string, error) {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("failed to get home directory: %w", err)
	}

	configDir := filepath.Join(homeDir, ".dfir-agent")
	if err := os.MkdirAll(configDir, 0755); err != nil && !os.IsExist(err) {
		return "", fmt.Errorf("failed to create config directory: %w", err)
	}

	agentIDPath := filepath.Join(configDir, AgentIDFile)

	// Try to load existing agent ID
	if data, err := os.ReadFile(agentIDPath); err == nil {
		return string(data), nil
	}

	// Generate new agent ID (UUIDv4)
	// In production, this should use crypto/rand or a UUID library
	timestamp := os.Getenv("DFIR_AGENT_ID")
	if timestamp != "" {
		return timestamp, nil
	}

	// Generate a deterministic ID based on hostname if possible
	hostname, _ := os.Hostname()
	agentID := fmt.Sprintf("AGENT-%s-%d", hostname, os.Getpid())

	if err := os.WriteFile(agentIDPath, []byte(agentID), 0644); err != nil {
		return "", fmt.Errorf("failed to save agent ID: %w", err)
	}

	return agentID, nil
}

// detectOSVersion returns a best-effort OS version string
func detectOSVersion() string {
	osName := runtime.GOOS
	arch := runtime.GOARCH

	switch osName {
	case "windows":
		return fmt.Sprintf("Windows %s (amd64)", getWindowsVersion())
	case "linux":
		return fmt.Sprintf("Linux (amd64)", getLinuxDistro())
	default:
		return fmt.Sprintf("%s (%s)", osName, arch)
	}
}

// getWindowsVersion attempts to get Windows version
// This is a simplified version - in production use proper Windows API calls
func getWindowsVersion() string {
	// For now, return a generic version
	// Could be enhanced with registry lookups or wmic commands
	return "10/11"
}

// getLinuxDistro attempts to get Linux distribution
func getLinuxDistro() string {
	// Check for common distro files
	if _, err := os.Stat("/etc/os-release"); err == nil {
		return "Generic Linux"
	}
	return "Unknown"
}
