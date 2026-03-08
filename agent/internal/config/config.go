package config

import (
	"crypto/rand"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

const (
	// Heartbeat interval in seconds
	DefaultHeartbeatInterval = 30
	// Poll interval in seconds
	DefaultPollInterval = 15
	// Default jitter percentage for OPSEC (±%)
	DefaultJitterPercent = 30
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
	OS                 string
	OSVersion          string
	AgentVersion        string
	HeartbeatInterval int
	PollInterval       int
	JitterPercent      int // ±% randomisation on intervals for OPSEC
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
		OS:                 detectOSName(),
		OSVersion:          detectOSVersion(),
		AgentVersion:        "1.0.0",
		HeartbeatInterval: DefaultHeartbeatInterval,
		PollInterval:       DefaultPollInterval,
		JitterPercent:      DefaultJitterPercent,
	}

	return cfg, nil
}

// LoadDryRun builds a minimal config for local module execution without backend.
func LoadDryRun() (*Config, error) {
	agentID, err := loadOrGenerateAgentID()
	if err != nil {
		return nil, fmt.Errorf("failed to load agent ID: %w", err)
	}

	return &Config{
		BackendURL:         "",
		AgentSharedSecret:  "dry-run",
		AgentID:            agentID,
		Hostname:           os.Getenv("DFIR_HOSTNAME"),
		IPAddress:          os.Getenv("DFIR_IP_ADDRESS"),
		Type:               os.Getenv("DFIR_TYPE"),
		OS:                 detectOSName(),
		OSVersion:          detectOSVersion(),
		AgentVersion:       "1.0.0",
		HeartbeatInterval: DefaultHeartbeatInterval,
		PollInterval:       DefaultPollInterval,
		JitterPercent:      DefaultJitterPercent,
	}, nil
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

	// Allow explicit override via environment variable
	if envID := os.Getenv("DFIR_AGENT_ID"); envID != "" {
		if err := os.WriteFile(agentIDPath, []byte(envID), 0600); err != nil {
			return "", fmt.Errorf("failed to save agent ID: %w", err)
		}
		return envID, nil
	}

	// Generate a cryptographically random UUID v4
	agentID, err := generateUUID()
	if err != nil {
		return "", fmt.Errorf("failed to generate agent ID: %w", err)
	}

	if err := os.WriteFile(agentIDPath, []byte(agentID), 0600); err != nil {
		return "", fmt.Errorf("failed to save agent ID: %w", err)
	}

	return agentID, nil
}

// detectOSVersion returns a best-effort OS version string
func detectOSVersion() string {
	arch := runtime.GOARCH
	switch runtime.GOOS {
	case "windows":
		return fmt.Sprintf("Windows %s (%s)", getWindowsVersion(), arch)
	case "linux":
		return fmt.Sprintf("%s (%s)", getLinuxDistro(), arch)
	default:
		return fmt.Sprintf("%s (%s)", runtime.GOOS, arch)
	}
}

func detectOSName() string {
	return fmt.Sprintf("%s/%s", runtime.GOOS, runtime.GOARCH)
}

// generateUUID returns a random UUID v4 string using crypto/rand.
func generateUUID() (string, error) {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", err
	}
	// Set version (4) and variant bits
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x",
		b[0:4], b[4:6], b[6:8], b[8:10], b[10:]), nil
}

// getWindowsVersion attempts to get Windows version
// This is a simplified version - in production use proper Windows API calls
func getWindowsVersion() string {
	// For now, return a generic version
	// Could be enhanced with registry lookups or wmic commands
	return "10/11"
}

// getLinuxDistro reads /etc/os-release to return the distribution name.
func getLinuxDistro() string {
	data, err := os.ReadFile("/etc/os-release")
	if err != nil {
		return "Generic Linux"
	}
	for _, line := range strings.Split(string(data), "\n") {
		if strings.HasPrefix(line, "PRETTY_NAME=") {
			name := strings.TrimPrefix(line, "PRETTY_NAME=")
			name = strings.Trim(name, "\"")
			if name != "" {
				return name
			}
		}
	}
	return "Generic Linux"
}
