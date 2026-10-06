package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
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

	client, err := NewClient(cfg)
	if err != nil {
		t.Fatalf("NewClient: %v", err)
	}
	payload := client.buildRegistrationPayload()
	if payload.OS != cfg.OS {
		t.Fatalf("expected OS %s, got %s", cfg.OS, payload.OS)
	}
}

func TestPollCommandAndPostResult(t *testing.T) {
	var polled bool
	var posted bool

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token := r.Header.Get(HeaderAgentToken)
		if token != "secret123" {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		if r.Method == "GET" && r.URL.Path == "/agent-commands/poll/AGENT-001" {
			polled = true
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(`{"command_id":"CMD-TEST1234","cmd":"whoami","timeout_sec":10}`))
			return
		}

		if r.Method == "POST" && r.URL.Path == "/agent-commands/result/CMD-TEST1234" {
			posted = true
			var res CommandResultPayload
			if err := json.NewDecoder(r.Body).Decode(&res); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			if res.ExitCode != 0 || res.Output != "analyst_output" {
				http.Error(w, "unexpected payload", http.StatusBadRequest)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(`{"status":"ok"}`))
			return
		}

		http.NotFound(w, r)
	}))
	defer server.Close()

	cfg := &config.Config{
		BackendURL:        server.URL,
		AgentSharedSecret: "secret123",
		AgentID:           "AGENT-001",
		AgentVersion:      "1.0.0",
	}

	client, err := NewClient(cfg)
	if err != nil {
		t.Fatalf("NewClient: %v", err)
	}

	ctx := context.Background()
	cmd, err := client.PollCommand(ctx)
	if err != nil {
		t.Fatalf("PollCommand: %v", err)
	}
	if cmd == nil || cmd.CommandID != "CMD-TEST1234" || cmd.Cmd != "whoami" {
		t.Fatalf("unexpected command: %+v", cmd)
	}
	if !polled {
		t.Fatal("expected PollCommand to hit server")
	}

	if err := client.PostCommandResult(ctx, cmd.CommandID, 0, "analyst_output"); err != nil {
		t.Fatalf("PostCommandResult: %v", err)
	}
	if !posted {
		t.Fatal("expected PostCommandResult to hit server")
	}
}
