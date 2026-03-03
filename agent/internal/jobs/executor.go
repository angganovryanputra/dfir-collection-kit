package jobs

import (
	"archive/zip"
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/dfir/agent/internal/api"
	"github.com/dfir/agent/internal/config"
	"github.com/dfir/agent/internal/logging"
	"github.com/dfir/agent/internal/modules"
	"github.com/dfir/agent/internal/storage"
)

// DefaultConcurrency is the number of modules that run in parallel when no limit is specified.
const DefaultConcurrency = 4

// Executor handles the execution of a collection job
type Executor struct {
	apiClient  *api.Client
	config     *config.Config
	currentJob *Job
}

// Job represents the current job being executed
type Job struct {
	ID            string
	IncidentID    string
	WorkDir       string
	CurrentModule string
	StartTime     time.Time
	Status        string
	Progress      int
}

// NewExecutor creates a new job executor
func NewExecutor(cfg *config.Config, apiClient *api.Client) *Executor {
	return &Executor{
		apiClient: apiClient,
		config:    cfg,
	}
}

// Run executes a job by processing all modules concurrently with a bounded worker pool.
// concurrencyLimit controls the maximum number of parallel modules; 0 uses DefaultConcurrency.
// Execution is best-effort: individual module failures are recorded but do not halt other modules.
// The job is only marked failed if every module fails.
func (e *Executor) Run(
	ctx context.Context,
	jobID string,
	incidentID string,
	workDir string,
	moduleList []api.JobModule,
	timeoutMinutes int,
	retryAttempts int,
	concurrencyLimit int,
) error {
	intPtr := func(value int) *int {
		return &value
	}

	isCancelled := func(status string) bool {
		switch status {
		case "cancelled", "canceled", "CANCELLED", "CANCELED":
			return true
		default:
			return false
		}
	}

	checkCancellation := func() error {
		if e.apiClient == nil {
			return nil
		}
		status, err := e.apiClient.GetJobStatus(ctx, jobID)
		if err != nil {
			return err
		}
		if isCancelled(status) {
			_ = e.apiClient.UpdateJobStatus(ctx, jobID, api.JobStatusUpdate{
				Status:  "cancelled",
				Message: "Job cancelled by operator",
				LogTail: []string{"Job cancelled by operator"},
			})
			return fmt.Errorf("job cancelled")
		}
		return nil
	}

	if concurrencyLimit <= 0 {
		concurrencyLimit = DefaultConcurrency
	}

	job := &Job{
		ID:            jobID,
		IncidentID:    incidentID,
		WorkDir:       workDir,
		CurrentModule: "INIT",
		StartTime:     time.Now(),
		Status:        "collecting",
		Progress:      0,
	}

	e.currentJob = job

	logJob := logging.WithJob(jobID)
	logJob.Info("Starting job execution")
	logJob.Info("Incident ID: %s", incidentID)
	logJob.Info("Work directory: %s", workDir)
	logJob.Info("Modules to execute: %d (concurrency: %d)", len(moduleList), concurrencyLimit)

	// Create work directory
	if err := storage.CreateWorkDir(workDir); err != nil {
		return fmt.Errorf("failed to create work directory: %w", err)
	}

	// Validate all modules before starting
	missingModules := []string{}
	for _, module := range moduleList {
		if !modules.HasModule(module.ModuleID) {
			missingModules = append(missingModules, module.ModuleID)
		}
	}
	if len(missingModules) > 0 {
		message := fmt.Sprintf("Unsupported modules: %s", strings.Join(missingModules, ", "))
		logJob.Error(message)
		if e.apiClient != nil {
			_ = e.apiClient.UpdateJobStatus(ctx, jobID, api.JobStatusUpdate{
				Status:  "failed",
				Message: message,
				LogTail: []string{message},
			})
		}
		return fmt.Errorf("%s", message)
	}

	// Report job started
	if e.apiClient != nil {
		if err := e.apiClient.UpdateJobStatus(ctx, jobID, api.JobStatusUpdate{
			Status:   "collecting",
			Progress: intPtr(0),
			Message:  "Job started",
		}); err != nil {
			return fmt.Errorf("failed to report job start: %w", err)
		}
	}

	// Execute modules concurrently with a bounded semaphore worker pool
	totalModules := len(moduleList)
	moduleTimeout := time.Duration(timeoutMinutes) * time.Minute

	type moduleResult struct {
		moduleID string
		err      error
	}

	sem := make(chan struct{}, concurrencyLimit)
	results := make(chan moduleResult, totalModules)
	var wg sync.WaitGroup
	var apiMu sync.Mutex // serialises concurrent API status updates

	for _, module := range moduleList {
		wg.Add(1)
		go func(mod api.JobModule) {
			defer wg.Done()

			// Acquire concurrency slot or respect context cancellation
			select {
			case sem <- struct{}{}:
			case <-ctx.Done():
				results <- moduleResult{mod.ModuleID, ctx.Err()}
				return
			}
			defer func() { <-sem }()

			logJob.Info("Starting module: %s", mod.ModuleID)
			apiMu.Lock()
			if e.apiClient != nil {
				_ = e.apiClient.UpdateJobStatus(ctx, jobID, api.JobStatusUpdate{
					Status:  "collecting",
					Message: fmt.Sprintf("Executing %s", mod.ModuleID),
					LogTail: []string{fmt.Sprintf("Executing module %s", mod.ModuleID)},
				})
			}
			apiMu.Unlock()

			// Execute with retry
			attempts := retryAttempts + 1
			if attempts < 1 {
				attempts = 1
			}
			var execErr error
			for attempt := 1; attempt <= attempts; attempt++ {
				if err := checkCancellation(); err != nil {
					execErr = err
					break
				}
				moduleCtx := ctx
				var cancel context.CancelFunc
				if timeoutMinutes > 0 {
					moduleCtx, cancel = context.WithTimeout(ctx, moduleTimeout)
				}
				execErr = e.executeModule(moduleCtx, job, mod)
				if cancel != nil {
					cancel()
				}
				if errors.Is(execErr, context.DeadlineExceeded) {
					logJob.Warning("Module timed out: %s", mod.ModuleID)
					apiMu.Lock()
					if e.apiClient != nil {
						_ = e.apiClient.UpdateJobStatus(ctx, jobID, api.JobStatusUpdate{
							Status:  "collecting",
							Message: fmt.Sprintf("Timeout in %s", mod.ModuleID),
							LogTail: []string{fmt.Sprintf("Timeout in %s", mod.ModuleID)},
						})
					}
					apiMu.Unlock()
				}
				if execErr == nil {
					break
				}
				logJob.Warning("Module attempt %d/%d failed: %s - %v", attempt, attempts, mod.ModuleID, execErr)
				if attempt < attempts {
					apiMu.Lock()
					if e.apiClient != nil {
						_ = e.apiClient.UpdateJobStatus(ctx, jobID, api.JobStatusUpdate{
							Status:  "collecting",
							Message: fmt.Sprintf("Retry %d/%d for %s", attempt, attempts, mod.ModuleID),
							LogTail: []string{fmt.Sprintf("Retry %d/%d for %s", attempt, attempts, mod.ModuleID)},
						})
					}
					apiMu.Unlock()
				}
			}

			results <- moduleResult{mod.ModuleID, execErr}
		}(module)
	}

	// Close the results channel once all goroutines finish
	go func() {
		wg.Wait()
		close(results)
	}()

	// Collect results (best-effort: accumulate failures, do not abort early)
	completed := 0
	var failedModules []string
	for result := range results {
		completed++
		progress := int(float64(completed) / float64(totalModules) * 100)
		job.Progress = progress

		if result.err != nil {
			logJob.Error("Module failed: %s - %v", result.moduleID, result.err)
			failedModules = append(failedModules, result.moduleID)
			apiMu.Lock()
			if e.apiClient != nil {
				_ = e.apiClient.UpdateJobStatus(ctx, jobID, api.JobStatusUpdate{
					Status:  "collecting",
					Message: fmt.Sprintf("Module %s failed: %v", result.moduleID, result.err),
					LogTail: []string{fmt.Sprintf("Module %s failed: %v", result.moduleID, result.err)},
				})
			}
			apiMu.Unlock()
		} else {
			logJob.Info("Completed module: %s (%d/%d)", result.moduleID, completed, totalModules)
			apiMu.Lock()
			if e.apiClient != nil {
				_ = e.apiClient.UpdateJobStatus(ctx, jobID, api.JobStatusUpdate{
					Status:   fmt.Sprintf("collecting (%d/%d)", completed, totalModules),
					Progress: intPtr(progress),
					Message:  fmt.Sprintf("Completed %s", result.moduleID),
					LogTail:  []string{fmt.Sprintf("Completed module %s", result.moduleID)},
				})
			}
			apiMu.Unlock()
		}
	}

	// Fail only if every module failed — otherwise proceed with partial evidence
	if len(failedModules) == totalModules && totalModules > 0 {
		msg := fmt.Sprintf("All modules failed: %s", strings.Join(failedModules, ", "))
		logJob.Error(msg)
		if e.apiClient != nil {
			_ = e.apiClient.UpdateJobStatus(ctx, jobID, api.JobStatusUpdate{
				Status:  "failed",
				Message: msg,
			})
		}
		return fmt.Errorf("%s", msg)
	}

	if len(failedModules) > 0 {
		logJob.Warning("Partial collection: %d/%d modules failed: %s",
			len(failedModules), totalModules, strings.Join(failedModules, ", "))
	}

	// Build and upload evidence ZIP
	logJob.Info("All modules processed, starting ZIP creation")
	if err := checkCancellation(); err != nil {
		return err
	}
	if err := e.createEvidenceZip(ctx, job); err != nil {
		logJob.Error("Failed to create evidence ZIP: %v", err)
		return err
	}

	logJob.Info("Evidence ZIP created successfully")

	if e.apiClient != nil {
		if err := checkCancellation(); err != nil {
			return err
		}
		if err := e.apiClient.UploadEvidence(ctx, jobID, filepath.Join(workDir, "collection.zip")); err != nil {
			logJob.Error("Failed to upload evidence: %v", err)
			return err
		}

		logJob.Info("Evidence uploaded successfully")

		if err := e.apiClient.UpdateJobStatus(ctx, jobID, api.JobStatusUpdate{
			Status:   "complete",
			Progress: intPtr(100),
			Message:  "Job completed successfully",
			LogTail:  []string{"Evidence uploaded successfully", "Collection complete"},
		}); err != nil {
			logJob.Warning("Failed to report job completion: %v", err)
		}
	}

	logJob.Info("Job completed successfully")
	return nil
}

// executeModule executes a single collection module.
// job fields are read-only after goroutines start; no concurrent writes occur here.
func (e *Executor) executeModule(ctx context.Context, job *Job, module api.JobModule) error {
	log := logging.WithJob(job.ID)

	moduleImpl, err := modules.GetModule(module.ModuleID)
	if err != nil {
		return fmt.Errorf("module not found: %s", module.ModuleID)
	}

	log.Info("Executing module implementation: %s", module.ModuleID)

	params := sanitizeParams(log, module.Params)

	mctx := modules.ModuleContext{
		JobID:      job.ID,
		IncidentID: job.IncidentID,
		WorkDir:    job.WorkDir,
		OS:         e.config.OS,
		IsAdmin:    modules.IsAdmin(),
	}

	outputPath, err := storage.SafeJoin(job.WorkDir, module.OutputRelPath)
	if err != nil {
		return fmt.Errorf("invalid output path: %w", err)
	}

	if err := moduleImpl.Run(ctx, mctx, params, outputPath); err != nil {
		if modules.IsWarning(err) {
			log.Warning("Module warning: %s - %v", module.ModuleID, err)
			if e.apiClient != nil {
				e.apiClient.UpdateJobStatus(ctx, job.ID, api.JobStatusUpdate{
					Status:  job.Status,
					Message: fmt.Sprintf("Warning in %s: %v", module.ModuleID, err),
					LogTail: []string{fmt.Sprintf("Warning in %s: %v", module.ModuleID, err)},
				})
			}
			return nil
		}
		return fmt.Errorf("module execution failed: %w", err)
	}

	log.Info("Module output written: %s", outputPath)
	return nil
}

func sanitizeParams(logJob logging.JobLogger, params map[string]interface{}) map[string]interface{} {
	if params == nil {
		return map[string]interface{}{}
	}
	clean := map[string]interface{}{}
	for key, value := range params {
		clean[key] = value
	}

	if value, ok := clean["time_window"].(string); ok {
		if _, exists := modules.AllowedTimeWindow(value); !exists {
			logJob.Warning("Invalid time_window %s, defaulting to 7d", value)
			delete(clean, "time_window")
		}
	}

	if value, ok := clean["max_lines"]; ok {
		if !modules.IsAllowedMaxLines(value) {
			logJob.Warning("Invalid max_lines %v ignored", value)
			delete(clean, "max_lines")
		}
	}

	if value, ok := clean["max_size_mb"]; ok {
		if !modules.IsAllowedMaxSizeMB(value) {
			logJob.Warning("Invalid max_size_mb %v ignored", value)
			delete(clean, "max_size_mb")
		}
	}

	return clean
}

// createEvidenceZip creates a ZIP archive of all collected evidence files.
func (e *Executor) createEvidenceZip(ctx context.Context, job *Job) error {
	log := logging.WithJob(job.ID)
	zipPath := filepath.Join(job.WorkDir, "collection.zip")
	log.Info("Creating evidence ZIP: %s", zipPath)

	zipFile, err := os.Create(zipPath)
	if err != nil {
		return fmt.Errorf("failed to create ZIP file: %w", err)
	}
	defer zipFile.Close()

	w := zip.NewWriter(zipFile)
	defer w.Close()

	err = filepath.Walk(job.WorkDir, func(path string, info os.FileInfo, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		// Skip directories and the ZIP file itself
		if info.IsDir() || path == zipPath {
			return nil
		}
		// Respect context cancellation between files
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}
		relPath, err := filepath.Rel(job.WorkDir, path)
		if err != nil {
			return fmt.Errorf("failed to compute relative path for %s: %w", path, err)
		}
		fw, err := w.Create(relPath)
		if err != nil {
			return fmt.Errorf("failed to create ZIP entry %s: %w", relPath, err)
		}
		f, err := os.Open(path)
		if err != nil {
			return fmt.Errorf("failed to open file %s: %w", path, err)
		}
		defer f.Close()
		if _, err := io.Copy(fw, f); err != nil {
			return fmt.Errorf("failed to write file %s to ZIP: %w", relPath, err)
		}
		return nil
	})
	if err != nil {
		return fmt.Errorf("failed to create evidence ZIP: %w", err)
	}

	log.Info("ZIP created successfully: %s", zipPath)
	return nil
}
