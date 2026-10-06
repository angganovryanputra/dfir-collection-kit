package agent

import (
	"context"
	"crypto/rand"
	"fmt"
	"math/big"
	"os/exec"
	"runtime"
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

// New creates a new agent instance, configuring the HTTP client with all
// enterprise transport options (TLS, proxy, custom CA).
func New(cfg *config.Config) (*Agent, error) {
	apiClient, err := api.NewClient(cfg)
	if err != nil {
		return nil, fmt.Errorf("init API client: %w", err)
	}
	return &Agent{
		config:    cfg,
		apiClient: apiClient,
		executor:  jobs.NewExecutor(cfg, apiClient),
		state:     StateIdle,
	}, nil
}

// registerWithRetry attempts registration with exponential back-off.
// If cfg.MaxRetries == 0 it retries indefinitely until the context is cancelled.
func (a *Agent) registerWithRetry(ctx context.Context) error {
	maxAttempts := a.config.MaxRetries
	intervalSec := a.config.RetryIntervalSec
	if intervalSec <= 0 {
		intervalSec = 15
	}
	attempt := 0
	for {
		attempt++
		_, err := a.apiClient.Register(ctx)
		if err == nil {
			return nil
		}
		if maxAttempts > 0 && attempt >= maxAttempts {
			return fmt.Errorf("registration failed after %d attempt(s): %w", attempt, err)
		}
		wait := time.Duration(intervalSec) * time.Second
		// Cap exponential back-off at 5 minutes
		expWait := time.Duration(attempt*intervalSec) * time.Second
		if expWait < wait {
			wait = expWait
		}
		if wait > 5*time.Minute {
			wait = 5 * time.Minute
		}
		logging.Warning("Registration attempt %d failed: %v — retrying in %s", attempt, err, wait)
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(wait):
		}
	}
}

// Run starts the agent and blocks until the context is cancelled.
func (a *Agent) Run(ctx context.Context) error {
	logging.Info("Starting DFIR Agent")
	logging.Info("Agent ID:   %s", a.config.AgentID)
	logging.Info("Backend:    %s", a.config.BackendURL)
	logging.Info("OS:         %s %s", a.config.OS, a.config.OSVersion)
	if a.config.TLSSkipVerify {
		logging.Warning("TLS verification disabled (tls-skip-verify)")
	}
	if a.config.ProxyURL != "" {
		logging.Info("Proxy:      %s", a.config.ProxyURL)
	}

	// Pre-flight connectivity check
	if err := a.apiClient.Ping(ctx); err != nil {
		logging.Warning("Pre-flight check: %v — will retry during registration", err)
	} else {
		logging.Info("Pre-flight connectivity check: OK")
	}

	// Registration with retry (handles boot-time network delays in enterprise)
	if err := a.registerWithRetry(ctx); err != nil {
		return fmt.Errorf("registration: %w", err)
	}

	// Main event loop with OPSEC jitter.
	// Instead of fixed-interval tickers (trivially fingerprintable as C2
	// 1. Background heartbeat routine ensures the agent constantly reports ONLINE
	// status, even during lengthy evidence collection runs.
	go func() {
		lastHb := time.Now()
		for {
			select {
			case <-ctx.Done():
				return
			case <-time.After(jitteredDuration(1*time.Second, 50)):
			}
			hbInterval := jitteredDuration(
				time.Duration(a.config.HeartbeatInterval)*time.Second,
				a.config.JitterPercent,
			)
			if time.Since(lastHb) >= hbInterval {
				if err := a.heartbeat(ctx); err != nil {
					logging.Error("Heartbeat failed: %v", err)
				}
				lastHb = time.Now()
			}
		}
	}()

	// 2. Background live command routine ensures analyst commands from the console
	// execute with sub-5s latency without waiting for collection jobs to finish.
	go func() {
		lastCmd := time.Now()
		for {
			select {
			case <-ctx.Done():
				return
			case <-time.After(jitteredDuration(1*time.Second, 50)):
			}
			cmdInterval := jitteredDuration(
				time.Duration(a.config.CommandPollInterval)*time.Second,
				a.config.JitterPercent,
			)
			if time.Since(lastCmd) >= cmdInterval {
				if err := a.pollAndExecuteCommand(ctx); err != nil {
					logging.Error("Live command execution failed: %v", err)
				}
				lastCmd = time.Now()
			}
		}
	}()

	// 3. Main collection job loop
	lastPoll := time.Now()
	for {
		select {
		case <-ctx.Done():
			logging.Info("Context cancelled, shutting down")
			return nil
		default:
		}

		pollInterval := jitteredDuration(
			time.Duration(a.config.PollInterval)*time.Second,
			a.config.JitterPercent,
		)
		if time.Since(lastPoll) >= pollInterval {
			if err := a.pollAndExecuteJob(ctx); err != nil {
				logging.Error("Job execution failed: %v", err)
			}
			lastPoll = time.Now()
		}

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

// pollAndExecuteCommand checks for pending ad-hoc commands from the analyst console and executes them
func (a *Agent) pollAndExecuteCommand(ctx context.Context) error {
	cmdInst, err := a.apiClient.PollCommand(ctx)
	if err != nil {
		return fmt.Errorf("failed to poll command: %w", err)
	}
	if cmdInst == nil {
		return nil
	}

	logging.Info("Executing live command [%s]: %s", cmdInst.CommandID, cmdInst.Cmd)

	timeoutSec := cmdInst.TimeoutSec
	if timeoutSec <= 0 || timeoutSec > 300 {
		timeoutSec = 30
	}
	cmdCtx, cancel := context.WithTimeout(ctx, time.Duration(timeoutSec)*time.Second)
	defer cancel()

	var execCmd *exec.Cmd
	if runtime.GOOS == "windows" {
		execCmd = exec.CommandContext(cmdCtx, "cmd.exe", "/C", cmdInst.Cmd)
	} else {
		execCmd = exec.CommandContext(cmdCtx, "sh", "-c", cmdInst.Cmd)
	}

	out, runErr := execCmd.CombinedOutput()
	exitCode := 0
	outputStr := string(out)

	if runErr != nil {
		if exitErr, ok := runErr.(*exec.ExitError); ok {
			exitCode = exitErr.ExitCode()
		} else if cmdCtx.Err() == context.DeadlineExceeded {
			exitCode = 124
			if outputStr != "" {
				outputStr += "\n"
			}
			outputStr += fmt.Sprintf("Command timed out after %d seconds", timeoutSec)
		} else {
			exitCode = 1
			if outputStr != "" {
				outputStr += "\n"
			}
			outputStr += fmt.Sprintf("Command execution error: %v", runErr)
		}
	}

	// Cap output to 500KB to stay safely below backend limit (1MB)
	const maxOutputBytes = 500 * 1024
	if len(outputStr) > maxOutputBytes {
		outputStr = outputStr[:maxOutputBytes] + "\n... [output truncated at 500KB] ..."
	}

	if postErr := a.apiClient.PostCommandResult(ctx, cmdInst.CommandID, exitCode, outputStr); postErr != nil {
		return fmt.Errorf("failed to post command result [%s]: %w", cmdInst.CommandID, postErr)
	}

	logging.Info("Command [%s] completed (exit_code=%d)", cmdInst.CommandID, exitCode)
	return nil
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
