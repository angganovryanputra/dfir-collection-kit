package jobs_test

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/dfir/agent/internal/api"
	"github.com/dfir/agent/internal/config"
	"github.com/dfir/agent/internal/jobs"
)

type mockRetryAPIClient struct {
	mu           sync.Mutex
	statusCalls  []string
	uploadCalls  []string
	failAttempts int
	totalCalls   int
	onUploadFail func()
}

func (m *mockRetryAPIClient) GetJobStatus(ctx context.Context, jobID string) (string, error) {
	return "collecting", nil
}

func (m *mockRetryAPIClient) UpdateJobStatus(ctx context.Context, jobID string, update api.JobStatusUpdate) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.statusCalls = append(m.statusCalls, update.Status)
	return nil
}

func (m *mockRetryAPIClient) UploadEvidence(ctx context.Context, jobID, zipPath string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.totalCalls++
	m.uploadCalls = append(m.uploadCalls, zipPath)
	if m.totalCalls <= m.failAttempts {
		if m.onUploadFail != nil {
			m.onUploadFail()
		}
		return errors.New("simulated upload network timeout")
	}
	return nil
}

func (m *mockRetryAPIClient) TotalCalls() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.totalCalls
}

// TestUploadRetry_TransientFailure_SuccessCleansWorkdir verifies that when upload
// fails transiently and succeeds on retry, the entire workdir is cleaned up.
func TestUploadRetry_TransientFailure_SuccessCleansWorkdir(t *testing.T) {
	tmpDir := t.TempDir()
	workDir := filepath.Join(tmpDir, "job-retry-success")

	// Fails 1st attempt, succeeds 2nd attempt
	mockAPI := &mockRetryAPIClient{failAttempts: 1}
	cfg := &config.Config{AgentID: "test-agent-retry-success", OS: "linux"}
	executor := jobs.NewExecutor(cfg, mockAPI)
	executor.SetUploadRetryDelay(5 * time.Millisecond)

	moduleList := []api.JobModule{{
		ModuleID:      "custom_retry_success_test",
		OutputRelPath: "custom/test.txt",
		Params:        map[string]interface{}{},
		Command:       "echo RETRY_SUCCESS",
	}}

	err := executor.Run(context.Background(), "JOB-RETRY-SUCCESS", "INC-001", workDir, moduleList, 5, 0, 1)
	if err != nil {
		t.Fatalf("executor.Run failed unexpectedly: %v", err)
	}

	if calls := mockAPI.TotalCalls(); calls != 2 {
		t.Fatalf("expected 2 upload attempts (1 fail + 1 success), got %d", calls)
	}

	// Verify work directory is completely removed after confirmed upload success
	if _, statErr := os.Stat(workDir); !os.IsNotExist(statErr) {
		t.Errorf("workdir should have been removed after successful upload, but still exists: %s", workDir)
	}
}

// TestUploadRetry_PersistentFailure_RetainsZipPrunesStaging verifies that when all
// upload retry attempts fail, collection.zip is retained in the workdir while uncompressed
// staging files and directories are pruned to prevent disk exhaustion.
func TestUploadRetry_PersistentFailure_RetainsZipPrunesStaging(t *testing.T) {
	tmpDir := t.TempDir()
	workDir := filepath.Join(tmpDir, "job-retry-persist-fail")

	// Fails all 3 attempts
	mockAPI := &mockRetryAPIClient{failAttempts: 10}
	cfg := &config.Config{AgentID: "test-agent-retry-fail", OS: "linux"}
	executor := jobs.NewExecutor(cfg, mockAPI)
	executor.SetUploadRetryDelay(5 * time.Millisecond)

	moduleList := []api.JobModule{{
		ModuleID:      "custom_persist_fail_test",
		OutputRelPath: "custom/evidence.txt",
		Params:        map[string]interface{}{},
		Command:       "echo PERSISTENT_EVIDENCE_PAYLOAD",
	}}

	err := executor.Run(context.Background(), "JOB-RETRY-FAIL", "INC-001", workDir, moduleList, 5, 0, 1)
	if err == nil {
		t.Fatal("expected executor.Run to fail after 3 upload attempts, but got nil")
	}

	if !strings.Contains(err.Error(), "evidence upload failed after 3 attempts") {
		t.Errorf("expected error message to mention 3 attempts, got: %v", err)
	}

	if calls := mockAPI.TotalCalls(); calls != 3 {
		t.Fatalf("expected 3 upload attempts, got %d", calls)
	}

	// Verify workdir itself still exists
	if _, statErr := os.Stat(workDir); os.IsNotExist(statErr) {
		t.Fatalf("workdir should be retained on persistent upload failure, but was removed: %s", workDir)
	}

	// Verify collection.zip exists and is non-empty
	zipPath := filepath.Join(workDir, "collection.zip")
	fi, statErr := os.Stat(zipPath)
	if os.IsNotExist(statErr) {
		t.Fatalf("collection.zip should be preserved in workdir: %s", zipPath)
	} else if statErr != nil {
		t.Fatalf("failed to stat collection.zip: %v", statErr)
	}
	if fi.Size() == 0 {
		t.Errorf("collection.zip should not be empty")
	}

	// Verify uncompressed staging directory 'custom' was pruned
	stagingDir := filepath.Join(workDir, "custom")
	if _, statErr := os.Stat(stagingDir); !os.IsNotExist(statErr) {
		t.Errorf("staging directory %s should have been pruned, but still exists", stagingDir)
	}

	// Verify uncompressed staging file was pruned
	stagingFile := filepath.Join(workDir, "custom", "evidence.txt")
	if _, statErr := os.Stat(stagingFile); !os.IsNotExist(statErr) {
		t.Errorf("staging file %s should have been pruned, but still exists", stagingFile)
	}
}

// TestUploadRetry_PreZipFailure_CleansWorkdir verifies that any failure occurring
// before collection.zip is created (such as invalid module specifications) completely
// cleans up the work directory.
func TestUploadRetry_PreZipFailure_CleansWorkdir(t *testing.T) {
	tmpDir := t.TempDir()
	workDir := filepath.Join(tmpDir, "job-prezip-fail")

	mockAPI := &mockRetryAPIClient{failAttempts: 0}
	cfg := &config.Config{AgentID: "test-agent-prezip", OS: "linux"}
	executor := jobs.NewExecutor(cfg, mockAPI)
	executor.SetUploadRetryDelay(5 * time.Millisecond)

	// An unsupported module fails validation before ZIP generation
	moduleList := []api.JobModule{{
		ModuleID:      "definitely_unsupported_module_xyz",
		OutputRelPath: "custom/fail.txt",
		Params:        map[string]interface{}{},
	}}

	err := executor.Run(context.Background(), "JOB-PREZIP-001", "INC-001", workDir, moduleList, 5, 0, 1)
	if err == nil {
		t.Fatal("expected executor.Run to fail on invalid module, got nil")
	}

	// Workdir must be completely removed
	if _, statErr := os.Stat(workDir); !os.IsNotExist(statErr) {
		t.Errorf("workdir should have been removed on pre-zip failure, but still exists: %s", workDir)
	}

	// Upload should not have been called
	if calls := mockAPI.TotalCalls(); calls != 0 {
		t.Errorf("expected 0 upload attempts on pre-zip failure, got %d", calls)
	}
}

// TestUploadRetry_ContextCancelled_AbortsAndRetainsZip verifies that when the context
// is cancelled during the backoff between upload attempts, the executor aborts immediately
// and retains collection.zip while pruning staging.
func TestUploadRetry_ContextCancelled_AbortsAndRetainsZip(t *testing.T) {
	tmpDir := t.TempDir()
	workDir := filepath.Join(tmpDir, "job-retry-cancel")

	ctx, cancel := context.WithCancel(context.Background())

	mockAPI := &mockRetryAPIClient{
		failAttempts: 10,
		onUploadFail: func() {
			// Cancel context right after attempt 1 fails, so backoff select catches ctx.Done()
			cancel()
		},
	}
	cfg := &config.Config{AgentID: "test-agent-cancel", OS: "linux"}
	executor := jobs.NewExecutor(cfg, mockAPI)
	executor.SetUploadRetryDelay(500 * time.Millisecond)

	moduleList := []api.JobModule{{
		ModuleID:      "custom_cancel_test",
		OutputRelPath: "custom/cancel_evidence.txt",
		Params:        map[string]interface{}{},
		Command:       "echo CANCEL_EVIDENCE",
	}}

	err := executor.Run(ctx, "JOB-CANCEL-001", "INC-001", workDir, moduleList, 5, 0, 1)
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("expected context.Canceled error, got: %v", err)
	}

	// Verify collection.zip was retained and staging pruned
	zipPath := filepath.Join(workDir, "collection.zip")
	if _, statErr := os.Stat(zipPath); os.IsNotExist(statErr) {
		t.Errorf("collection.zip should be preserved in workdir: %s", zipPath)
	}

	stagingDir := filepath.Join(workDir, "custom")
	if _, statErr := os.Stat(stagingDir); !os.IsNotExist(statErr) {
		t.Errorf("staging directory %s should have been pruned, but still exists", stagingDir)
	}
}
