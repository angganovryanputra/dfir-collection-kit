package agent

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/dfir/agent/internal/config"
)

func TestPollAndExecuteCommand(t *testing.T) {
	var polled bool
	var posted bool
	var reportedOutput string
	var reportedExitCode int

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "GET" && r.URL.Path == "/agent-commands/poll/TEST-AGENT" {
			polled = true
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(`{"command_id":"CMD-999","cmd":"echo test_live_command","timeout_sec":5}`))
			return
		}

		if r.Method == "POST" && r.URL.Path == "/agent-commands/result/CMD-999" {
			posted = true
			var payload struct {
				Output   string `json:"output"`
				ExitCode int    `json:"exit_code"`
			}
			if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			reportedOutput = payload.Output
			reportedExitCode = payload.ExitCode
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(`{"status":"ok"}`))
			return
		}

		http.NotFound(w, r)
	}))
	defer server.Close()

	cfg := &config.Config{
		BackendURL:          server.URL,
		AgentSharedSecret:   "secret",
		AgentID:             "TEST-AGENT",
		CommandPollInterval: 1,
	}

	a, err := New(cfg)
	if err != nil {
		t.Fatalf("New agent: %v", err)
	}

	ctx := context.Background()
	if err := a.pollAndExecuteCommand(ctx); err != nil {
		t.Fatalf("pollAndExecuteCommand failed: %v", err)
	}

	if !polled {
		t.Fatal("expected agent to poll command")
	}
	if !posted {
		t.Fatal("expected agent to post result")
	}
	if reportedExitCode != 0 {
		t.Fatalf("expected exit code 0, got %d. Output: %s", reportedExitCode, reportedOutput)
	}
	if !strings.Contains(reportedOutput, "test_live_command") {
		t.Fatalf("expected output to contain 'test_live_command', got %q", reportedOutput)
	}
}
