package jobs

import (
	"context"
	"fmt"
	"os/exec"
	"path/filepath"
	"time"

	"github.com/dfir/agent/internal/api"
	"github.com/dfir/agent/internal/config"
	"github.com/dfir/agent/internal/logging"
	"github.com/dfir/agent/internal/modules"
	"github.com/dfir/agent/internal/storage"
)

// Executor handles the execution of a collection job
type Executor struct {
	apiClient  *api.Client
	config     *config.Config
	currentJob *Job
}

// Job represents the current job being executed
type Job struct {
	ID         string
	IncidentID  string
	WorkDir    string
	CurrentModule string
	StartTime   time.Time
	Status     string
	Progress   int
}

// NewExecutor creates a new job executor
func NewExecutor(cfg *config.Config, apiClient *api.Client) *Executor {
	return &Executor{
		apiClient: apiClient,
		config:     cfg,
	}
}

// Run executes a job by processing all modules in sequence
func (e *Executor) Run(ctx context.Context, jobID string, incidentID string, workDir string, moduleList []api.JobModule) error {
	job := &Job{
		ID:         jobID,
		IncidentID:  incidentID,
		WorkDir:    workDir,
		CurrentModule: "INIT",
		StartTime:   time.Now(),
		Status:     "collecting",
		Progress:   0,
	}

	e.currentJob = job

	logJob := logging.WithJob(jobID)
	logJob.Info("Starting job execution")
	logJob.Info("Incident ID: %s", incidentID)
	logJob.Info("Work directory: %s", workDir)
	logJob.Info("Modules to execute: %d", len(moduleList))

	// Create work directory
	if err := storage.CreateWorkDir(workDir); err != nil {
		return fmt.Errorf("failed to create work directory: %w", err)
	}

	// Initialize modules
	if err := modules.Init(); err != nil {
		return fmt.Errorf("failed to initialize modules: %w", err)
	}

	// Report job started
	if err := e.apiClient.UpdateJobStatus(ctx, jobID, api.JobStatusUpdate{
		Status:   "collecting",
		Progress: 0,
		Message:  "Job started",
	}); err != nil {
		return fmt.Errorf("failed to report job start: %w", err)
	}

	// Execute modules in sequence
	totalModules := len(moduleList)
	for i, module := range moduleList {
		job.CurrentModule = module.ModuleID
		job.Status = fmt.Sprintf("collecting (%d/%d)", i+1, totalModules)

		logJob.Info("Executing module: %s", module.ModuleID)
		logJob.Debug("Output path: %s", module.OutputRelPath)
		logJob.Debug("Params: %v", module.Params)

		if err := e.executeModule(ctx, job, module); err != nil {
			logJob.Error("Module failed: %s - %v", module.ModuleID, err)

			// Report module failure
			e.apiClient.UpdateJobStatus(ctx, jobID, api.JobStatusUpdate{
				Status:   "failed",
				Message:  fmt.Sprintf("Module %s failed: %v", module.ModuleID, err),
			})

			return fmt.Errorf("module execution failed: %w", err)
		}

		// Update progress
		job.Progress = int(float64(i+1) / float64(totalModules) * 100)
		if err := e.apiClient.UpdateJobStatus(ctx, jobID, api.JobStatusUpdate{
			Status:   job.Status,
			Progress: &job.Progress,
			Message:  fmt.Sprintf("Completed %s", module.ModuleID),
		}); err != nil {
			logJob.Warning("Failed to update progress: %v", err)
		}
	}

	// Report job completion
	logJob.Info("All modules completed, starting ZIP creation")
	if err := e.createEvidenceZip(ctx, job); err != nil {
		logJob.Error("Failed to create evidence ZIP: %w", err)
		return err
	}

	logJob.Info("Evidence ZIP created successfully")

	// Upload evidence
	if err := e.apiClient.UploadEvidence(ctx, jobID, filepath.Join(workDir, "collection.zip")); err != nil {
		logJob.Error("Failed to upload evidence: %w", err)
		return err
	}

	logJob.Info("Evidence uploaded successfully")

	// Report job completion
	if err := e.apiClient.UpdateJobStatus(ctx, jobID, api.JobStatusUpdate{
		Status:  "complete",
		Progress: 100,
		Message: "Job completed successfully",
	}); err != nil {
		logJob.Warning("Failed to report job completion: %v", err)
	}

	logJob.Info("Job completed successfully")
	return nil
}

// executeModule executes a single collection module
func (e *Executor) executeModule(ctx context.Context, job *Job, module api.JobModule) error {
	// Get module implementation
	moduleImpl, err := modules.GetModule(module.ModuleID)
	if err != nil {
		return fmt.Errorf("module not found: %s", module.ModuleID)
	}

	logJob.Info("Module implementation: %s", module.ModuleID)

	// Build module context
	mctx := modules.ModuleContext{
		JobID:      job.ID,
		IncidentID: job.IncidentID,
		WorkDir:    job.WorkDir,
		OS:         e.config.OSVersion,
	}

	// Execute module
	outputPath := filepath.Join(job.WorkDir, module.OutputRelPath)

	if err := moduleImpl.Run(ctx, mctx, module.Params, outputPath); err != nil {
		return fmt.Errorf("module execution failed: %w", err)
	}

	logJob.Info("Module output: %s", outputPath)
	return nil
}

// createEvidenceZip creates a ZIP file of all collected evidence
func (e *Executor) createEvidenceZip(ctx context.Context, job *Job) error {
	zipPath := filepath.Join(job.WorkDir, "collection.zip")

	logJob.Info("Creating evidence ZIP: %s", zipPath)

	// Use archive/zip command (works on both Windows and Linux)
	cmd := exec.CommandContext(ctx, "tar", "--create", "--format=zip", "-C", job.WorkDir, "-f", zipPath)

	if output, err := cmd.CombinedOutput(); err != nil {
		logJob.Error("ZIP creation failed: %s", output)
		return fmt.Errorf("failed to create ZIP: %w", err)
	}

	logJob.Info("ZIP created: %s", zipPath)
	return nil
}
