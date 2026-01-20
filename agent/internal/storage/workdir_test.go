package storage

import (
	"path/filepath"
	"testing"
)

func TestSafeJoinValid(t *testing.T) {
	workDir := filepath.Join("/tmp", "dfir")
	path, err := SafeJoin(workDir, "logs/system.txt")
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if path == "" {
		t.Fatalf("expected non-empty path")
	}
}

func TestSafeJoinRejectsTraversal(t *testing.T) {
	workDir := filepath.Join("/tmp", "dfir")
	_, err := SafeJoin(workDir, "../evil.txt")
	if err == nil {
		t.Fatalf("expected traversal error")
	}
}
