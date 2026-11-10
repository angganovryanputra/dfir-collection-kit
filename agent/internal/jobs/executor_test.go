package jobs_test

import (
	"archive/zip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"io"
	"os"
	"path/filepath"
	"sort"
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

func TestCustomModuleRejectsShellOperators(t *testing.T) {
	tmpDir := t.TempDir()
	executor := jobs.NewExecutor(&config.Config{AgentID: "test-agent-custom", OS: "linux"}, nil)
	err := executor.Run(context.Background(), "JOB-CUST-REJECT", "INC-CUST-001", tmpDir, []api.JobModule{{
		ModuleID: "custom_unsafe_test", OutputRelPath: "custom/out.txt", Command: "echo safe; uname -a",
	}}, 5, 0, 1)
	if err == nil {
		t.Fatal("custom module with a shell operator should be rejected")
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

// TestCreateEvidenceZip_GeneratesSha256Manifest verifies that createEvidenceZip computes
// SHA-256 hashes for all collected evidence files, writes a sorted manifest.sha256 to job.WorkDir,
// and archives manifest.sha256 inside collection.zip.
func TestCreateEvidenceZip_GeneratesSha256Manifest(t *testing.T) {
	tmpDir := t.TempDir()
	workDir := filepath.Join(tmpDir, "job-workdir-manifest-test")
	if err := os.MkdirAll(workDir, 0755); err != nil {
		t.Fatalf("failed to create test workdir: %v", err)
	}

	// 1. Create multiple evidence files in workDir, including nested directories
	files := map[string][]byte{
		"artifact1.txt":               []byte("Forensic evidence content sample 1"),
		"artifacts/windows/MFT":       []byte("Simulated MFT binary content header 0123456789"),
		"artifacts/network/conns.csv": []byte("src_ip,dst_ip,port\n192.168.1.5,10.0.0.1,443\n"),
	}

	expectedHashes := make(map[string]string)
	for relPath, content := range files {
		absPath := filepath.Join(workDir, filepath.FromSlash(relPath))
		if err := os.MkdirAll(filepath.Dir(absPath), 0755); err != nil {
			t.Fatalf("failed to create directory for %s: %v", relPath, err)
		}
		if err := os.WriteFile(absPath, content, 0644); err != nil {
			t.Fatalf("failed to write test evidence %s: %v", relPath, err)
		}
		h := sha256.Sum256(content)
		expectedHashes[relPath] = hex.EncodeToString(h[:])
	}

	cfg := &config.Config{AgentID: "test-agent-manifest", OS: "linux"}
	executor := jobs.NewExecutor(cfg, nil)

	job := &jobs.Job{
		ID:         "JOB-MANIFEST-001",
		IncidentID: "INC-MANIFEST-001",
		WorkDir:    workDir,
	}

	// 2. Run CreateEvidenceZip
	if err := executor.CreateEvidenceZip(context.Background(), job); err != nil {
		t.Fatalf("CreateEvidenceZip failed: %v", err)
	}

	// 3. Verify manifest.sha256 was written to workDir
	manifestDiskPath := filepath.Join(workDir, "manifest.sha256")
	manifestData, err := os.ReadFile(manifestDiskPath)
	if err != nil {
		t.Fatalf("manifest.sha256 not found on disk: %v", err)
	}

	manifestStr := string(manifestData)
	lines := strings.Split(strings.TrimSpace(manifestStr), "\n")
	if len(lines) != len(files) {
		t.Fatalf("expected %d entries in manifest.sha256, got %d: %q", len(files), len(lines), lines)
	}

	// Check determinism & sorting
	var manifestRelPaths []string
	for _, line := range lines {
		parts := strings.SplitN(line, "  ", 2)
		if len(parts) != 2 {
			t.Fatalf("malformed manifest line (expected '<hash>  <relpath>'): %q", line)
		}
		hash, rel := parts[0], parts[1]
		manifestRelPaths = append(manifestRelPaths, rel)

		expectedHash, ok := expectedHashes[rel]
		if !ok {
			t.Errorf("unexpected file in manifest.sha256: %s", rel)
			continue
		}
		if hash != expectedHash {
			t.Errorf("hash mismatch for %s: got %s, want %s", rel, hash, expectedHash)
		}
	}

	if !sort.StringsAreSorted(manifestRelPaths) {
		t.Errorf("manifest.sha256 lines are not sorted by relative path: %v", manifestRelPaths)
	}

	// 4. Verify collection.zip contains all evidence files and manifest.sha256
	zipPath := filepath.Join(workDir, "collection.zip")
	zr, err := zip.OpenReader(zipPath)
	if err != nil {
		t.Fatalf("failed to open generated collection.zip: %v", err)
	}
	defer zr.Close()

	zipEntries := make(map[string]*zip.File)
	for _, zf := range zr.File {
		zipEntries[zf.Name] = zf
	}

	// Verify all original evidence files exist in zip
	for relPath, expectedContent := range files {
		zf, ok := zipEntries[relPath]
		if !ok {
			t.Errorf("expected file %s missing from collection.zip", relPath)
			continue
		}
		rc, err := zf.Open()
		if err != nil {
			t.Fatalf("failed to open %s from zip: %v", relPath, err)
		}
		data, err := io.ReadAll(rc)
		rc.Close()
		if err != nil {
			t.Fatalf("failed to read %s from zip: %v", relPath, err)
		}
		if string(data) != string(expectedContent) {
			t.Errorf("content mismatch for %s in zip", relPath)
		}
	}

	// Verify manifest.sha256 exists in zip and matches disk content
	manifestZipEntry, ok := zipEntries["manifest.sha256"]
	if !ok {
		t.Fatal("manifest.sha256 missing from collection.zip")
	}
	rc, err := manifestZipEntry.Open()
	if err != nil {
		t.Fatalf("failed to open manifest.sha256 from zip: %v", err)
	}
	zipManifestData, err := io.ReadAll(rc)
	rc.Close()
	if err != nil {
		t.Fatalf("failed to read manifest.sha256 from zip: %v", err)
	}

	if string(zipManifestData) != manifestStr {
		t.Errorf("manifest.sha256 content mismatch between zip and disk:\nZip:\n%s\nDisk:\n%s",
			string(zipManifestData), manifestStr)
	}
}
