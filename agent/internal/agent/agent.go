package agent

import (
	"context"
	"crypto/rand"
	"fmt"
	"math/big"
	"sync"
	"time"

	"github.com/dfir/agent/internal/api"
	"github.com/dfir/agent/internal/config"
	"github.com/dfir/agent/internal/jobs"
	"github.com/dfir/agent/internal/logging"
)

const (
	// Agent states
	StateIdle     = "IDLE"
	StateRunning   = "RUNNING"
	StateShutting = "SHUTTING_DOWN"
)

// Agent manages the main agent lifecycle
type Agent struct {
	config    *config.Config
	apiClient *api.Client
	executor  *jobs.Executor
	mu        sync.Mutex
	state     string
}

func (a *Agent) getState() string {
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.state
}

func (a *Agent) setState(s string) {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.state = s
}

// New creates a new agent instance
func New(cfg *config.Config) (*Agent, error) {
	apiClient := api.NewClient(cfg)
	executor := jobs.NewExecutor(cfg, apiClient)

	return &Agent{
		config:    cfg,
		apiClient: apiClient,
		executor:  executor,
		state:     StateIdle,
	}, nil
}

// Run starts the agent and runs until shutdown
func (a *Agent) Run(ctx context.Context) error {
	logging.Info("Starting DFIR Agent")
	logging.Info("Agent ID: %s", a.config.AgentID)
	logging.Info("Backend URL: %s", a.config.BackendURL)
	logging.Info("OS: %s", a.config.OS)
	logging.Info("OS Version: %s", a.config.OSVersion)

	// Register agent on startup
	if _, err := a.apiClient.Register(ctx); err != nil {
		return fmt.Errorf("failed to register agent: %w", err)
	}

	// Main event loop with OPSEC jitter.
	// Instead of fixed-interval tickers (trivially fingerprintable as C2
	// beaconing), we add ±30 % randomisation to every sleep.

	lastHeartbeat := time.Now()
	lastPoll := time.Now()

	for {
		select {
		case <-ctx.Done():
			logging.Info("Context cancelled, shutting down")
			return nil
		default:
		}

		now := time.Now()

		// Heartbeat with jitter
		hbInterval := jitteredDuration(
			time.Duration(a.config.HeartbeatInterval)*time.Second,
			a.config.JitterPercent,
		)
		if now.Sub(lastHeartbeat) >= hbInterval {
			if err := a.heartbeat(ctx); err != nil {
				logging.Error("Heartbeat failed: %v", err)
			}
			lastHeartbeat = time.Now()
		}

		// Job poll with jitter
		pollInterval := jitteredDuration(
			time.Duration(a.config.PollInterval)*time.Second,
			a.config.JitterPercent,
		)
		if now.Sub(lastPoll) >= pollInterval {
			if err := a.pollAndExecuteJob(ctx); err != nil {
				logging.Error("Job execution failed: %v", err)
			}
			lastPoll = time.Now()
		}

		// Short sleep to avoid busy-waiting; also jittered
		time.Sleep(jitteredDuration(1*time.Second, 50))
	}
}

// heartbeat sends periodic status updates to the backend.
// Heartbeats are sent regardless of current state so that the backend
// can accurately track ONLINE vs OFFLINE for all agents, including idle ones.
func (a *Agent) heartbeat(ctx context.Context) error {
	logging.Debug("Sending heartbeat (state=%s)", a.getState())
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

	a.setState(StateRunning)

	if err := a.executor.Run(
		ctx,
		job.JobID,
		job.IncidentID,
		job.WorkDir,
		job.Modules,
		job.CollectionTimeoutMin,
		job.RetryAttempts,
		job.ConcurrencyLimit,
	); err != nil {
		return err
	}

	a.setState(StateIdle)
	logging.WithJob(job.JobID).Info("Job completed")
	return nil
}

// jitteredDuration returns base ± jitterPct% using crypto/rand.
// For example, jitteredDuration(30s, 30) returns something in [21s, 39s].
func jitteredDuration(base time.Duration, jitterPct int) time.Duration {
	if jitterPct <= 0 {
		return base
	}
	maxJitter := int64(float64(base) * float64(jitterPct) / 100.0)
	if maxJitter == 0 {
		return base
	}

	n, err := rand.Int(rand.Reader, big.NewInt(2*maxJitter))
	if err != nil {
		// Fallback: return the base duration without jitter
		return base
	}
	delta := time.Duration(n.Int64() - maxJitter)
	result := base + delta
	if result <= 0 {
		return base
	}
	return result
}
