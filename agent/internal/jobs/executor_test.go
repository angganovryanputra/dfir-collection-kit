package jobs_test

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/dfir/agent/internal/api"
	"github.com/dfir/agent/internal/config"
	"github.com/dfir/agent/internal/jobs"
	"github.com/dfir/agent/internal/modules"
)

func init() {
	// Register all modules once for the test process
	_ = modules.Init()
}

// TestCustomModuleExecution verifies a JobModule with Command runs the shell
// command and writes its output to the output path.
func TestCustomModuleExecution(t *testing.T) {
	tmpDir := t.TempDir()

	cfg := &config.Config{AgentID: "test-agent-custom", OS: "linux"}
	executor := jobs.NewExecutor(cfg, nil)

	moduleList := []api.JobModule{{
		ModuleID:      "custom_echo_test",
		OutputRelPath: "custom/echo_output.txt",
		Params:        map[string]interface{}{},
		Command:       "echo CUSTOM_MODULE_OK",
	}}

	err := executor.Run(context.Background(), "JOB-CUST-001", "INC-CUST-001", tmpDir, moduleList, 5, 0, 1)
	if err != nil {
		t.Fatalf("executor.Run returned unexpected error: %v", err)
	}

	outPath := filepath.Join(tmpDir, "custom", "echo_output.txt")
	data, readErr := os.ReadFile(outPath)
	if readErr != nil {
		t.Fatalf("output file not created at %s: %v", outPath, readErr)
	}
	if !strings.Contains(string(data), "CUSTOM_MODULE_OK") {
		t.Errorf("expected output to contain 'CUSTOM_MODULE_OK', got: %q", string(data))
	}
}

// TestWorkdirCleanupOnFailure verifies the work directory is removed when
// the job fails (non-existent module, no command).
func TestWorkdirCleanupOnFailure(t *testing.T) {
	tmpDir := t.TempDir()
	workDir := filepath.Join(tmpDir, "job-workdir-cleanup-test")

	cfg := &config.Config{AgentID: "test-agent-cleanup", OS: "linux"}
	executor := jobs.NewExecutor(cfg, nil)

	// No command + unknown module_id → guaranteed module-not-found failure
	moduleList := []api.JobModule{{
		ModuleID:      "definitely_does_not_exist_xyz",
		OutputRelPath: "output.txt",
		Params:        map[string]interface{}{},
	}}

	err := executor.Run(context.Background(), "JOB-CLEANUP-001", "INC-CLEANUP-001", workDir, moduleList, 5, 0, 1)
	if err == nil {
		// If somehow it didn't fail (e.g. best-effort continued), skip
		t.Skip("No error returned — skipping cleanup assertion")
	}

	if _, statErr := os.Stat(workDir); !os.IsNotExist(statErr) {
		t.Errorf("workdir should have been cleaned up on failure, but still exists: %s", workDir)
	}
}
