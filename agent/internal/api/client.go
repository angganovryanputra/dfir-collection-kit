// Package api — DFIR backend HTTP client.
//
// Enterprise-hardened:
//   - Custom CA certificate support (corporate PKI / SSL inspection)
//   - TLS skip-verify option (Zscaler, BlueCoat, Cisco NGFW)
//   - Explicit HTTP/HTTPS proxy configuration
//   - Separate upload timeout for large evidence ZIPs on slow WAN
//   - Streaming multipart upload — never buffers ZIP in memory (avoids OOM)
//   - Retry with exponential back-off on transient failures
//   - Context-aware cancellation throughout
package api

import (
	"bytes"
	"context"
	"crypto/tls"
	"crypto/x509"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"time"

	"github.com/dfir/agent/internal/config"
	"github.com/dfir/agent/internal/logging"
)

// safeIDRe mirrors backend _SAFE_ID_RE — prevents path traversal in URLs.
var safeIDRe = regexp.MustCompile(`^[A-Za-z0-9_-]{1,128}$`)

func validateID(id string) error {
	if !safeIDRe.MatchString(id) {
		return fmt.Errorf("unsafe ID value: %q", id)
	}
	return nil
}

const (
	// Default timeout for API calls (heartbeat, status, job poll).
	DefaultTimeout   = 30 * time.Second
	HeaderAgentToken = "X-Agent-Token"
)

// Client handles all communication with the DFIR backend.
type Client struct {
	httpClient   *http.Client // general-purpose: 30s timeout
	uploadClient *http.Client // evidence upload: long / no timeout
	config       *config.Config
	baseURL      string
}

// NewClient builds a Client that respects all enterprise transport settings.
func NewClient(cfg *config.Config) (*Client, error) {
	transport, err := buildTransport(cfg)
	if err != nil {
		return nil, fmt.Errorf("build HTTP transport: %w", err)
	}
	uploadTransport, err := buildTransport(cfg)
	if err != nil {
		return nil, fmt.Errorf("build upload transport: %w", err)
	}

	var uploadTimeout time.Duration
	if cfg.UploadTimeoutMin > 0 {
		uploadTimeout = time.Duration(cfg.UploadTimeoutMin) * time.Minute
	}

	return &Client{
		httpClient:   &http.Client{Transport: transport, Timeout: DefaultTimeout},
		uploadClient: &http.Client{Transport: uploadTransport, Timeout: uploadTimeout},
		config:       cfg,
		baseURL:      cfg.BackendURL,
	}, nil
}

// buildTransport creates an *http.Transport with TLS and proxy settings.
func buildTransport(cfg *config.Config) (*http.Transport, error) {
	dialTimeout := time.Duration(cfg.ConnectTimeoutSec) * time.Second
	if dialTimeout <= 0 {
		dialTimeout = 10 * time.Second
	}

	tlsCfg := &tls.Config{
		InsecureSkipVerify: cfg.TLSSkipVerify, //nolint:gosec // explicit user opt-in
	}
	if cfg.TLSSkipVerify {
		logging.Warning("TLS certificate verification DISABLED — only use in trusted enterprise environments")
	}

	// Custom CA certificate bundle (for corporate PKI / SSL-inspection CA)
	if cfg.TLSCACertPath != "" {
		pem, err := os.ReadFile(cfg.TLSCACertPath)
		if err != nil {
			return nil, fmt.Errorf("read CA cert %s: %w", cfg.TLSCACertPath, err)
		}
		pool, sysErr := x509.SystemCertPool()
		if sysErr != nil || pool == nil {
			pool = x509.NewCertPool()
		}
		if !pool.AppendCertsFromPEM(pem) {
			return nil, fmt.Errorf("no valid certificates found in %s", cfg.TLSCACertPath)
		}
		tlsCfg.RootCAs = pool
		logging.Info("Loaded custom CA bundle from %s", cfg.TLSCACertPath)
	}

	// Explicit proxy or fall back to environment variables (HTTP_PROXY, HTTPS_PROXY)
	var proxyFn func(*http.Request) (*url.URL, error)
	if cfg.ProxyURL != "" {
		proxyURL, err := url.Parse(cfg.ProxyURL)
		if err != nil {
			return nil, fmt.Errorf("invalid proxy URL %q: %w", cfg.ProxyURL, err)
		}
		proxyFn = http.ProxyURL(proxyURL)
		logging.Info("Using proxy: %s", cfg.ProxyURL)
	} else {
		proxyFn = http.ProxyFromEnvironment // respects HTTP_PROXY / HTTPS_PROXY / NO_PROXY
	}

	return &http.Transport{
		Proxy: proxyFn,
		DialContext: (&net.Dialer{
			Timeout:   dialTimeout,
			KeepAlive: 30 * time.Second,
		}).DialContext,
		TLSClientConfig:       tlsCfg,
		TLSHandshakeTimeout:   10 * time.Second,
		ResponseHeaderTimeout: 30 * time.Second,
		ExpectContinueTimeout: 1 * time.Second,
		MaxIdleConns:          10,
		MaxIdleConnsPerHost:   5,
		IdleConnTimeout:       90 * time.Second,
		ForceAttemptHTTP2:     true,
	}, nil
}

// makeRequest sends a JSON-encoded request and returns the raw response.
func (c *Client) makeRequest(ctx context.Context, method, path string, body interface{}, _ string) (*http.Response, error) {
	var reqBody io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return nil, fmt.Errorf("marshal request: %w", err)
		}
		reqBody = bytes.NewBuffer(data)
	}
	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, reqBody)
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	req.Header.Set(HeaderAgentToken, c.config.AgentSharedSecret)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	return c.httpClient.Do(req)
}

// makeRequestWithRetry wraps makeRequest with exponential back-off for
// transient network failures.  Does NOT retry 4xx/5xx HTTP errors.
func (c *Client) makeRequestWithRetry(ctx context.Context, method, path string, body interface{}, maxAttempts int) (*http.Response, error) {
	if maxAttempts <= 0 {
		maxAttempts = 3
	}
	var lastErr error
	for attempt := 1; attempt <= maxAttempts; attempt++ {
		resp, err := c.makeRequest(ctx, method, path, body, "")
		if err == nil {
			return resp, nil
		}
		lastErr = err
		if attempt < maxAttempts {
			wait := time.Duration(attempt*attempt) * time.Second
			if wait > 30*time.Second {
				wait = 30 * time.Second
			}
			logging.Warning("%s %s failed (attempt %d/%d): %v — retry in %s",
				method, path, attempt, maxAttempts, err, wait)
			select {
			case <-ctx.Done():
				return nil, ctx.Err()
			case <-time.After(wait):
			}
		}
	}
	return nil, lastErr
}

// ── Registration ───────────────────────────────────────────────────────────────

type DeviceRegistration struct {
	ID           string `json:"id"`
	Hostname     string `json:"hostname"`
	IPAddress    string `json:"ip_address"`
	Type         string `json:"type"`
	OS           string `json:"os"`
	AgentVersion string `json:"agent_version"`
	Status       string `json:"status"`
}

type DeviceUpdate struct {
	Hostname         string `json:"hostname,omitempty"`
	IPAddress        string `json:"ip_address,omitempty"`
	Type             string `json:"type,omitempty"`
	OS               string `json:"os,omitempty"`
	AgentVersion     string `json:"agent_version,omitempty"`
	Status           string `json:"status,omitempty"`
	LastSeen         string `json:"last_seen,omitempty"`
	CollectionStatus string `json:"collection_status,omitempty"`
}

func (c *Client) buildRegistrationPayload() DeviceRegistration {
	hostname := c.config.Hostname
	if hostname == "" {
		hostname, _ = os.Hostname()
	}
	ip := c.config.IPAddress
	if ip == "" {
		ip = detectLocalIP()
	}
	return DeviceRegistration{
		ID:           c.config.AgentID,
		Hostname:     hostname,
		IPAddress:    ip,
		Type:         c.config.Type,
		OS:           c.config.OS,
		AgentVersion: c.config.AgentVersion,
		Status:       "ONLINE",
	}
}

// Register sends the initial registration request (with retries).
func (c *Client) Register(ctx context.Context) (map[string]interface{}, error) {
	resp, err := c.makeRequestWithRetry(ctx, "POST", "/agents/register", c.buildRegistrationPayload(), 3)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("registration failed: HTTP %d: %s", resp.StatusCode, string(body))
	}
	var result map[string]interface{}
	_ = json.NewDecoder(resp.Body).Decode(&result)
	logging.Info("Agent registered successfully: %s", c.config.AgentID)
	return result, nil
}

// Ping calls the health endpoint to verify backend reachability.
// Returns nil if the backend is reachable and healthy.
func (c *Client) Ping(ctx context.Context) error {
	req, err := http.NewRequestWithContext(ctx, "GET", c.baseURL+"/status/health", nil)
	if err != nil {
		return fmt.Errorf("ping: create request: %w", err)
	}
	req.Header.Set(HeaderAgentToken, c.config.AgentSharedSecret)
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("backend unreachable at %s: %w", c.baseURL, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 500 {
		return fmt.Errorf("backend returned HTTP %d", resp.StatusCode)
	}
	return nil
}

// Heartbeat sends periodic status update.
func (c *Client) Heartbeat(ctx context.Context) error {
	if err := validateID(c.config.AgentID); err != nil {
		return fmt.Errorf("heartbeat: %w", err)
	}
	resp, err := c.makeRequest(ctx, "POST", "/agents/"+c.config.AgentID+"/heartbeat",
		DeviceUpdate{Status: "ONLINE", LastSeen: time.Now().UTC().Format(time.RFC3339), OS: c.config.OS}, "")
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("heartbeat: HTTP %d: %s", resp.StatusCode, string(body))
	}
	return nil
}

// ── Job management ─────────────────────────────────────────────────────────────

type JobStatusResponse struct{ Status string `json:"status"` }

type JobStatusUpdate struct {
	Status   string   `json:"status"`
	Message  string   `json:"message,omitempty"`
	Progress *int     `json:"progress,omitempty"`
	LogTail  []string `json:"log_tail,omitempty"`
}

// JobInstruction is the server-issued job descriptor.
type JobInstruction struct {
	JobID                string      `json:"job_id"`
	IncidentID           string      `json:"incident_id"`
	OS                   string      `json:"os,omitempty"`
	WorkDir              string      `json:"work_dir,omitempty"`
	Modules              []JobModule `json:"modules"`
	CollectionTimeoutMin int         `json:"collection_timeout_min,omitempty"`
	RetryAttempts        int         `json:"retry_attempts,omitempty"`
	ConcurrencyLimit     int         `json:"concurrency_limit,omitempty"`
}

// JobModule describes one artifact to collect.
// If Command is set the agent runs it as a shell command (custom module).
type JobModule struct {
	ModuleID      string                 `json:"module_id"`
	OutputRelPath string                 `json:"output_relpath"`
	Params        map[string]interface{} `json:"params"`
	Command       string                 `json:"command,omitempty"`
}

func (c *Client) GetNextJob(ctx context.Context) (*JobInstruction, error) {
	if err := validateID(c.config.AgentID); err != nil {
		return nil, fmt.Errorf("GetNextJob: %w", err)
	}
	resp, err := c.makeRequest(ctx, "GET", "/agents/"+c.config.AgentID+"/jobs/next", nil, "")
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusNotFound || resp.StatusCode == http.StatusNoContent {
		return nil, nil // no pending job
	}
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("GetNextJob: HTTP %d: %s", resp.StatusCode, string(body))
	}
	var job JobInstruction
	if err := json.NewDecoder(resp.Body).Decode(&job); err != nil {
		return nil, fmt.Errorf("GetNextJob decode: %w", err)
	}
	logging.WithJob(job.JobID).Info("Received job: %s", job.JobID)
	return &job, nil
}

func (c *Client) GetJobStatus(ctx context.Context, jobID string) (string, error) {
	if err := validateID(c.config.AgentID); err != nil {
		return "", err
	}
	if err := validateID(jobID); err != nil {
		return "", err
	}
	resp, err := c.makeRequest(ctx, "GET", "/agents/"+c.config.AgentID+"/jobs/"+jobID, nil, "")
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("GetJobStatus: HTTP %d: %s", resp.StatusCode, string(body))
	}
	var s JobStatusResponse
	_ = json.NewDecoder(resp.Body).Decode(&s)
	return s.Status, nil
}

func (c *Client) UpdateJobStatus(ctx context.Context, jobID string, update JobStatusUpdate) error {
	if err := validateID(c.config.AgentID); err != nil {
		return err
	}
	if err := validateID(jobID); err != nil {
		return err
	}
	resp, err := c.makeRequest(ctx, "POST",
		"/agents/"+c.config.AgentID+"/jobs/"+jobID+"/status", update, "")
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("UpdateJobStatus: HTTP %d: %s", resp.StatusCode, string(body))
	}
	logging.WithJob(jobID).Info("Status updated: %s", update.Status)
	return nil
}

// ── Evidence upload ────────────────────────────────────────────────────────────

// UploadEvidence uploads the evidence ZIP to the backend.
//
// Strategy:
//  1. Try pre-signed S3 URL (stream file directly to S3 — most efficient)
//  2. Fallback: streaming multipart POST to backend
//
// Both paths STREAM the file from disk — no full-file buffering in memory.
func (c *Client) UploadEvidence(ctx context.Context, jobID string, zipPath string) error {
	if err := validateID(c.config.AgentID); err != nil {
		return fmt.Errorf("UploadEvidence: %w", err)
	}
	if err := validateID(jobID); err != nil {
		return fmt.Errorf("UploadEvidence: %w", err)
	}

	// Attempt direct-to-S3 upload
	if urlResp, err := c.makeRequest(ctx, "GET",
		"/agents/"+c.config.AgentID+"/jobs/"+jobID+"/upload-url", nil, ""); err == nil {
		defer urlResp.Body.Close()
		if urlResp.StatusCode == http.StatusOK {
			var ps struct {
				URL    string `json:"url"`
				Method string `json:"method"`
			}
			if json.NewDecoder(urlResp.Body).Decode(&ps) == nil && ps.URL != "" {
				logging.WithJob(jobID).Info("Direct-to-S3 upload (%s)", ps.Method)
				if s3Err := c.uploadToS3(ctx, jobID, zipPath, ps.URL, ps.Method); s3Err == nil {
					// Notify backend
					if notResp, notErr := c.makeRequest(ctx, "POST",
						"/agents/"+c.config.AgentID+"/jobs/"+jobID+"/upload-complete", nil, ""); notErr == nil {
						defer notResp.Body.Close()
						if notResp.StatusCode == http.StatusOK {
							logging.WithJob(jobID).Info("S3 upload complete")
							return nil
						}
					}
					logging.WithJob(jobID).Warning("S3 upload OK but backend notification failed — falling back")
				} else {
					logging.WithJob(jobID).Warning("S3 upload failed (%v), using direct upload", s3Err)
				}
			}
		}
	}

	// Streaming multipart fallback
	logging.WithJob(jobID).Info("Streaming multipart upload to backend")
	return c.streamingMultipartUpload(ctx, jobID, zipPath)
}

// streamingMultipartUpload sends the ZIP to the backend using io.Pipe so the
// file is NEVER fully loaded into memory.  This fixes the OOM bug that existed
// when var body bytes.Buffer was used for large (50 GB) evidence archives.
func (c *Client) streamingMultipartUpload(ctx context.Context, jobID, zipPath string) error {
	stat, err := os.Stat(zipPath)
	if err != nil {
		return fmt.Errorf("stat ZIP: %w", err)
	}
	logging.WithJob(jobID).Info("Upload size: %.1f MiB", float64(stat.Size())/1024/1024)

	pr, pw := io.Pipe()
	mw := multipart.NewWriter(pw)

	writeErrCh := make(chan error, 1)
	go func() {
		defer func() { mw.Close(); pw.Close() }() //nolint:errcheck
		part, err := mw.CreateFormFile("file", filepath.Base(zipPath))
		if err != nil {
			writeErrCh <- err
			return
		}
		f, err := os.Open(zipPath)
		if err != nil {
			writeErrCh <- err
			return
		}
		defer f.Close()
		_, err = io.Copy(part, f)
		writeErrCh <- err
	}()

	req, err := http.NewRequestWithContext(ctx, "POST",
		c.baseURL+"/agents/"+c.config.AgentID+"/jobs/"+jobID+"/upload", pr)
	if err != nil {
		pw.CloseWithError(err)
		<-writeErrCh
		return fmt.Errorf("create upload request: %w", err)
	}
	req.Header.Set(HeaderAgentToken, c.config.AgentSharedSecret)
	req.Header.Set("Content-Type", mw.FormDataContentType())

	resp, httpErr := c.uploadClient.Do(req)
	if wErr := <-writeErrCh; wErr != nil && httpErr == nil {
		httpErr = wErr
	}
	if httpErr != nil {
		return fmt.Errorf("upload failed: %w", httpErr)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("upload: HTTP %d: %s", resp.StatusCode, string(body))
	}
	logging.WithJob(jobID).Info("Evidence uploaded successfully")
	return nil
}

// uploadToS3 streams the ZIP to a pre-signed S3 PUT URL.
func (c *Client) uploadToS3(ctx context.Context, jobID, zipPath, presignedURL, method string) error {
	f, err := os.Open(zipPath)
	if err != nil {
		return fmt.Errorf("open ZIP for S3: %w", err)
	}
	defer f.Close()
	stat, err := f.Stat()
	if err != nil {
		return fmt.Errorf("stat ZIP: %w", err)
	}
	req, err := http.NewRequestWithContext(ctx, method, presignedURL, f)
	if err != nil {
		return fmt.Errorf("create S3 request: %w", err)
	}
	req.ContentLength = stat.Size()
	resp, err := c.uploadClient.Do(req)
	if err != nil {
		return fmt.Errorf("S3 PUT: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("S3: HTTP %d: %s", resp.StatusCode, string(body))
	}
	logging.WithJob(jobID).Info("S3 direct upload: %d bytes", stat.Size())
	return nil
}

// ── Helpers ────────────────────────────────────────────────────────────────────

func detectLocalIP() string {
	addrs, err := net.InterfaceAddrs()
	if err != nil {
		return ""
	}
	for _, addr := range addrs {
		if ipNet, ok := addr.(*net.IPNet); ok &&
			!ipNet.IP.IsLoopback() && ipNet.IP.To4() != nil {
			return ipNet.IP.String()
		}
	}
	return ""
}
