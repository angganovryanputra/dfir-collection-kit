package api

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"time"

	"github.com/dfir/agent/internal/config"
	"github.com/dfir/agent/internal/logging"
)

const (
	// API timeout for all HTTP requests
	DefaultTimeout = 30 * time.Second
	// User agent header for authentication
	HeaderAgentToken = "X-Agent-Token"
)

// Client handles communication with the DFIR backend
type Client struct {
	httpClient  *http.Client
	config      *config.Config
	baseURL     string
}

// NewClient creates a new API client
func NewClient(cfg *config.Config) *Client {
	return &Client{
		httpClient: &http.Client{
			Timeout: DefaultTimeout,
		},
		config:  cfg,
		baseURL: cfg.BackendURL,
	}
}

// makeRequest is a helper to make HTTP requests with proper authentication
func (c *Client) makeRequest(ctx context.Context, method, path string, body interface{}, contentType string) (*http.Response, error) {
	url := c.baseURL + path

	var reqBody io.Reader
	if body != nil {
		jsonBody, err := json.Marshal(body)
		if err != nil {
			return nil, fmt.Errorf("failed to marshal request body: %w", err)
		}
		reqBody = bytes.NewBuffer(jsonBody)
		contentType = "application/json"
	}

	req, err := http.NewRequestWithContext(ctx, method, url, reqBody)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set(HeaderAgentToken, c.config.AgentSharedSecret)

	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}

	return resp, nil
}

// DeviceRegistration represents the payload for agent registration
type DeviceRegistration struct {
	ID          string `json:"id"`
	Hostname    string `json:"hostname"`
	IPAddress   string `json:"ip_address"`
	Type        string `json:"type"`
	OS          string `json:"os"`
	AgentVersion string `json:"agent_version"`
	Status      string `json:"status"`
}

// DeviceUpdate represents the payload for heartbeat
type DeviceUpdate struct {
	Hostname      string  `json:"hostname,omitempty"`
	IPAddress     string  `json:"ip_address,omitempty"`
	Type          string  `json:"type,omitempty"`
	OS            string  `json:"os,omitempty"`
	AgentVersion  string  `json:"agent_version,omitempty"`
	Status        string  `json:"status,omitempty"`
	LastSeen      string  `json:"last_seen,omitempty"`
	CPUUsage      *int    `json:"cpu_usage,omitempty"`
	MemoryUsage  *int    `json:"memory_usage,omitempty"`
	CollectionStatus string  `json:"collection_status,omitempty"`
}

// Register sends the initial registration request to the backend
func (c *Client) Register(ctx context.Context) (map[string]interface{}, error) {
	payload := c.buildRegistrationPayload()

	resp, err := c.makeRequest(ctx, "POST", "/agents/register", payload, "")
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("registration failed: status %d: %s", resp.StatusCode, string(body))
	}

	var result map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	logging.Info("Agent registered successfully: %s", c.config.AgentID)
	return result, nil
}

func (c *Client) buildRegistrationPayload() DeviceRegistration {
	return DeviceRegistration{
		ID:           c.config.AgentID,
		Hostname:     c.config.Hostname,
		IPAddress:    c.config.IPAddress,
		Type:         c.config.Type,
		OS:           c.config.OS,
		AgentVersion: c.config.AgentVersion,
		Status:       "ONLINE",
	}
}

// Heartbeat sends a periodic status update to the backend
func (c *Client) Heartbeat(ctx context.Context) error {
	payload := DeviceUpdate{
		Status:   "ONLINE",
		LastSeen: time.Now().UTC().Format(time.RFC3339),
		OS:       c.config.OS,
	}

	resp, err := c.makeRequest(ctx, "POST", "/agents/"+c.config.AgentID+"/heartbeat", payload, "")
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("heartbeat failed: status %d: %s", resp.StatusCode, string(body))
	}

	return nil
}

// JobInstruction represents the job instruction from backend
type JobInstruction struct {
	JobID      string         `json:"job_id"`
	IncidentID string         `json:"incident_id"`
	OS         string         `json:"os,omitempty"`
	WorkDir    string         `json:"work_dir,omitempty"`
	Modules    []JobModule     `json:"modules"`
}

// JobModule represents a module to execute
type JobModule struct {
	ModuleID     string                 `json:"module_id"`
	OutputRelPath string                 `json:"output_relpath"`
	Params       map[string]interface{} `json:"params"`
}

// GetNextJob polls the backend for the next job to execute
func (c *Client) GetNextJob(ctx context.Context) (*JobInstruction, error) {
	url := "/agents/" + c.config.AgentID + "/jobs/next"

	resp, err := c.makeRequest(ctx, "GET", url, nil, "")
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		logging.Debug("No pending jobs")
		return nil, nil
	}

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("get job failed: status %d: %s", resp.StatusCode, string(body))
	}

	var job JobInstruction
	if err := json.NewDecoder(resp.Body).Decode(&job); err != nil {
		return nil, fmt.Errorf("failed to decode job: %w", err)
	}

	logging.WithJob(job.JobID).Info("Received job: %s", job.JobID)
	return &job, nil
}

// JobStatusUpdate represents a job status update
type JobStatusUpdate struct {
	Status    string   `json:"status"`
	Message   string   `json:"message,omitempty"`
	Progress  *int      `json:"progress,omitempty"`
	LogTail   []string  `json:"log_tail,omitempty"`
}

// UpdateJobStatus sends a status update for a running job
func (c *Client) UpdateJobStatus(ctx context.Context, jobID string, update JobStatusUpdate) error {
	url := "/agents/" + c.config.AgentID + "/jobs/" + jobID + "/status"

	resp, err := c.makeRequest(ctx, "POST", url, update, "")
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("status update failed: status %d: %s", resp.StatusCode, string(body))
	}

	logging.WithJob(jobID).Info("Status updated: %s", update.Status)
	return nil
}

// UploadEvidence uploads the evidence ZIP file to the backend
func (c *Client) UploadEvidence(ctx context.Context, jobID string, zipPath string) error {
	file, err := os.Open(zipPath)
	if err != nil {
		return fmt.Errorf("failed to open zip file: %w", err)
	}
	defer file.Close()

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)

	part, err := writer.CreateFormFile("file", zipPath, 0)
	if err != nil {
		return fmt.Errorf("failed to create form file: %w", err)
	}

	if _, err := io.Copy(part, file); err != nil {
		return fmt.Errorf("failed to write file to form: %w", err)
	}

	if err := writer.Close(); err != nil {
		return fmt.Errorf("failed to close multipart writer: %w", err)
	}

	url := "/agents/" + c.config.AgentID + "/jobs/" + jobID + "/upload"

	req, err := http.NewRequestWithContext(ctx, "POST", c.baseURL+url, &body)
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set(HeaderAgentToken, c.config.AgentSharedSecret)
	req.Header.Set("Content-Type", writer.FormDataContentType())

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("upload failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("upload failed: status %d: %s", resp.StatusCode, string(body))
	}

	var result map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return fmt.Errorf("failed to decode upload response: %w", err)
	}

	logging.WithJob(jobID).Info("Evidence uploaded successfully")
	return nil
}
