package agent

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"time"

	"github.com/dfir/agent/internal/api"
	"github.com/dfir/agent/internal/config"
	"github.com/dfir/agent/internal/jobs"
	"github.com/dfir/agent/internal/logging"
	"github.com/dfir/agent/internal/storage"
)

const (
	// Agent states
	StateIdle     = "IDLE"
	StateRunning   = "RUNNING"
	StateShutting = "SHUTTING_DOWN"
)

// Agent manages the main agent lifecycle
type Agent struct {
	config   *config.Config
	apiClient *api.Client
	executor *jobs.Executor
	state    string
}

// New creates a new agent instance
func New(cfg *config.Config) (*Agent, error) {
	apiClient := api.NewClient(cfg)
	executor := jobs.NewExecutor(cfg, apiClient)

	return &Agent{
		config:   cfg,
		apiClient: apiClient,
		executor: executor,
		state:    StateIdle,
	}
}

// Run starts the agent and runs until shutdown
func (a *Agent) Run(ctx context.Context) error {
	logging.Info("Starting DFIR Agent")
	logging.Info("Agent ID: %s", a.config.AgentID)
	logging.Info("Backend URL: %s", a.config.BackendURL)
	logging.Info("OS: %s", a.config.OSVersion)

	// Register agent on startup
	if _, err := a.apiClient.Register(ctx); err != nil {
		return fmt.Errorf("failed to register agent: %w", err)
	}

	a.state = StateRunning
	logging.Info("Agent registered successfully")

	// Start heartbeat ticker
	heartbeatTicker := time.NewTicker(time.Duration(a.config.HeartbeatInterval) * time.Second)
	defer heartbeatTicker.Stop()

	// Start job polling ticker
	jobPollTicker := time.NewTicker(time.Duration(a.config.PollInterval) * time.Second)
	defer jobPollTicker.Stop()

	// Setup signal handling for graceful shutdown
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, os.Signal(15)) // SIGTERM

	// Main event loop
	for {
		select {
		case <-ctx.Done():
			logging.Info("Context cancelled, shutting down")
			return nil

		case sig := <-sigChan:
			logging.Info("Received signal: %v, initiating shutdown", sig)
			return nil

		case <-heartbeatTicker.C:
			if err := a.heartbeat(ctx); err != nil {
				logging.Error("Heartbeat failed: %v", err)
			}

		case <-jobPollTicker.C:
			if err := a.pollAndExecuteJob(ctx); err != nil {
				logging.Error("Job execution failed: %v", err)
			}
		}
	}
}

// heartbeat sends periodic status updates to the backend
func (a *Agent) heartbeat(ctx context.Context) error {
	if a.state != StateRunning {
		return fmt.Errorf("agent is not running")
	}

	logging.Debug("Sending heartbeat")
	return a.apiClient.Heartbeat(ctx)
}

// pollAndExecuteJob checks for new jobs and executes them
func (a *Agent) pollAndExecuteJob(ctx context.Context) error {
	logging.Debug("Polling for next job")

	job, err := a.apiClient.GetNextJob(ctx)
	if err != nil {
		return fmt.Errorf("failed to get next job: %w", err)
	}

	if job == nil {
		logging.Debug("No pending jobs")
		return nil
	}

	logging.WithJob(job.JobID).Info("Executing job: %s", job.JobID)
	logging.Info("Incident ID: %s", job.IncidentID)
	logging.Info("Work directory: %s", job.WorkDir)

	a.state = StateRunning

	if err := a.executor.Run(ctx, job.JobID, job.IncidentID, job.WorkDir, job.Modules); err != nil {
		return err
	}

	a.state = StateIdle
	logging.WithJob(job.JobID).Info("Job completed")
	return nil
}
