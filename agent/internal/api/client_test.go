package api

import (
	"testing"

	"github.com/dfir/agent/internal/config"
)

func TestRegistrationPayloadOS(t *testing.T) {
	cfg := &config.Config{
		AgentID:      "AGENT-TEST",
		Hostname:     "host",
		IPAddress:    "127.0.0.1",
		Type:         "test",
		OS:           "linux/amd64",
		OSVersion:    "Linux (amd64)",
		AgentVersion: "1.0.0",
	}

	client := NewClient(cfg)
	payload := client.buildRegistrationPayload()
	if payload.OS != cfg.OS {
		t.Fatalf("expected OS %s, got %s", cfg.OS, payload.OS)
	}
}
