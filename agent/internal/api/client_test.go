package api

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
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

type transportInterceptor struct {
	base            http.RoundTripper
	capturedCLHead  string
	capturedTEHead  string
	capturedCLValue int64
}

func (ti *transportInterceptor) RoundTrip(req *http.Request) (*http.Response, error) {
	ti.capturedCLValue = req.ContentLength
	ti.capturedCLHead = req.Header.Get("Content-Length")
	ti.capturedTEHead = req.Header.Get("Transfer-Encoding")
	return ti.base.RoundTrip(req)
}

func TestUploadZipStreamingContentLength(t *testing.T) {
	tmpDir := t.TempDir()
	zipPath := filepath.Join(tmpDir, "evidence_test.zip")
	mockContent := []byte("PK\x03\x04test_mock_zip_evidence_payload_0123456789abcdef\n")
	if err := os.WriteFile(zipPath, mockContent, 0600); err != nil {
		t.Fatalf("write dummy zip: %v", err)
	}

	var serverContentLength int64
	var serverTransferEncoding []string
	var serverParsedPayload []byte
	var serverFilename string
	var serverPartHeaderContentType string
	var uploadEndpointHit bool

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token := r.Header.Get(HeaderAgentToken)
		if token != "token-xyz" {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		if r.Method == "POST" && r.URL.Path == "/agents/AGENT-007/jobs/JOB-999/upload" {
			uploadEndpointHit = true
			serverContentLength = r.ContentLength
			serverTransferEncoding = r.TransferEncoding

			// Read body using MultipartReader to verify valid multipart formatting
			mr, err := r.MultipartReader()
			if err != nil {
				http.Error(w, fmt.Sprintf("invalid multipart body: %v", err), http.StatusBadRequest)
				return
			}
			part, err := mr.NextPart()
			if err != nil {
				http.Error(w, fmt.Sprintf("failed to get first part: %v", err), http.StatusBadRequest)
				return
			}
			serverFilename = part.FileName()
			serverPartHeaderContentType = part.Header.Get("Content-Type")

			serverParsedPayload, err = io.ReadAll(part)
			if err != nil {
				http.Error(w, fmt.Sprintf("failed to read part: %v", err), http.StatusInternalServerError)
				return
			}

			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)
			w.Write([]byte(`{"status":"uploaded"}`))
			return
		}

		http.NotFound(w, r)
	}))
	defer server.Close()

	cfg := &config.Config{
		BackendURL:   server.URL,
		AgentToken:   "token-xyz",
		AgentID:      "AGENT-007",
		AgentVersion: "1.0.0",
	}

	client, err := NewClient(cfg)
	if err != nil {
		t.Fatalf("NewClient: %v", err)
	}

	// Intercept outgoing uploadClient request to verify headers before wire transport
	interceptor := &transportInterceptor{base: client.uploadClient.Transport}
	client.uploadClient.Transport = interceptor

	ctx := context.Background()
	if err := client.uploadZip(ctx, "JOB-999", zipPath); err != nil {
		t.Fatalf("uploadZip failed: %v", err)
	}

	if !uploadEndpointHit {
		t.Fatal("expected upload endpoint to be hit")
	}

	// 1. Verify req.ContentLength > 0 and Content-Length header matching byte count
	if interceptor.capturedCLValue <= 0 {
		t.Fatalf("expected req.ContentLength > 0, got %d", interceptor.capturedCLValue)
	}
	expectedCLHeader := strconv.FormatInt(interceptor.capturedCLValue, 10)
	if interceptor.capturedCLHead != expectedCLHeader {
		t.Fatalf("expected Content-Length header %q, got %q", expectedCLHeader, interceptor.capturedCLHead)
	}

	// 2. Verify server-received ContentLength matches client outgoing ContentLength
	if serverContentLength != interceptor.capturedCLValue {
		t.Fatalf("server received ContentLength %d, expected %d", serverContentLength, interceptor.capturedCLValue)
	}

	// 3. Verify does NOT send Transfer-Encoding: chunked
	if interceptor.capturedTEHead != "" {
		t.Fatalf("expected no Transfer-Encoding header on client request, got %q", interceptor.capturedTEHead)
	}
	for _, te := range serverTransferEncoding {
		if strings.EqualFold(te, "chunked") {
			t.Fatalf("server received chunked Transfer-Encoding: %v", serverTransferEncoding)
		}
	}

	// 4. Validate that uploaded payload is readable as valid multipart form file with matching contents
	if serverFilename != filepath.Base(zipPath) {
		t.Fatalf("expected filename %q, got %q", filepath.Base(zipPath), serverFilename)
	}
	if serverPartHeaderContentType != "application/zip" {
		t.Fatalf("expected part Content-Type 'application/zip', got %q", serverPartHeaderContentType)
	}
	if !bytes.Equal(serverParsedPayload, mockContent) {
		t.Fatalf("server payload content mismatch: got %q, expected %q", string(serverParsedPayload), string(mockContent))
	}
}

func TestUploadZipErrorHandling(t *testing.T) {
	tmpDir := t.TempDir()
	zipPath := filepath.Join(tmpDir, "missing.zip")

	cfg := &config.Config{
		BackendURL:   "http://127.0.0.1:9",
		AgentToken:   "token-xyz",
		AgentID:      "AGENT-007",
		AgentVersion: "1.0.0",
	}
	client, err := NewClient(cfg)
	if err != nil {
		t.Fatalf("NewClient: %v", err)
	}

	// 1. Missing file error
	err = client.uploadZip(context.Background(), "JOB-1", zipPath)
	if err == nil || !strings.Contains(err.Error(), "open ZIP") {
		t.Fatalf("expected open ZIP error, got: %v", err)
	}

	// 2. Server 500 error
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "internal disk error", http.StatusInternalServerError)
	}))
	defer server.Close()

	client.baseURL = server.URL
	realZipPath := filepath.Join(tmpDir, "valid.zip")
	if err := os.WriteFile(realZipPath, []byte("data"), 0600); err != nil {
		t.Fatalf("write file: %v", err)
	}

	err = client.uploadZip(context.Background(), "JOB-1", realZipPath)
	if err == nil || !strings.Contains(err.Error(), "HTTP 500") {
		t.Fatalf("expected HTTP 500 error, got: %v", err)
	}
}

func TestUploadEvidenceFallbackToUploadZip(t *testing.T) {
	tmpDir := t.TempDir()
	zipPath := filepath.Join(tmpDir, "fallback_test.zip")
	mockContent := []byte("PK\x03\x04test_fallback_evidence_data")
	if err := os.WriteFile(zipPath, mockContent, 0600); err != nil {
		t.Fatalf("write file: %v", err)
	}

	var fallbackHit bool

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// S3 upload-url returns 404 (S3 not available)
		if r.Method == "GET" && r.URL.Path == "/agents/AGENT-007/jobs/JOB-FB/upload-url" {
			http.NotFound(w, r)
			return
		}
		// Fallback streaming upload
		if r.Method == "POST" && r.URL.Path == "/agents/AGENT-007/jobs/JOB-FB/upload" {
			fallbackHit = true
			if r.ContentLength <= 0 {
				http.Error(w, "missing content-length", http.StatusBadRequest)
				return
			}
			w.WriteHeader(http.StatusOK)
			w.Write([]byte(`{"status":"uploaded"}`))
			return
		}
		http.NotFound(w, r)
	}))
	defer server.Close()

	cfg := &config.Config{
		BackendURL:   server.URL,
		AgentToken:   "token-xyz",
		AgentID:      "AGENT-007",
		AgentVersion: "1.0.0",
	}
	client, err := NewClient(cfg)
	if err != nil {
		t.Fatalf("NewClient: %v", err)
	}

	if err := client.UploadEvidence(context.Background(), "JOB-FB", zipPath); err != nil {
		t.Fatalf("UploadEvidence failed: %v", err)
	}
	if !fallbackHit {
		t.Fatal("expected fallback upload to be hit")
	}
}
