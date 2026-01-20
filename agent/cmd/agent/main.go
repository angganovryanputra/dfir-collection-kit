package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"os/signal"
	"strings"
	"time"

	"github.com/dfir/agent/internal/agent"
	"github.com/dfir/agent/internal/api"
	"github.com/dfir/agent/internal/config"
	"github.com/dfir/agent/internal/jobs"
	"github.com/dfir/agent/internal/logging"
	"github.com/dfir/agent/internal/modules"
	"github.com/dfir/agent/internal/storage"
)

const (
	// Program name and version
	ProgramName = "dfir-agent"
	Version    = "1.0.0"
)

func main() {
	logging.Init()

	dryRun := flag.Bool("dry-run", false, "Run modules locally without backend")
	modulesList := flag.String("modules", "", "Comma-separated module IDs for dry-run")
	workDirFlag := flag.String("workdir", "", "Work directory for dry-run output")
	flag.Parse()

	fmt.Printf("%s v%s\n", ProgramName, Version)
	logging.Info("Starting DFIR Agent")

	var cfg *config.Config
	var err error
	if *dryRun {
		cfg, err = config.LoadDryRun()
	} else {
		cfg, err = config.Load()
	}
	if err != nil {
		logging.Error("Configuration error: %v", err)
		fmt.Fprintf(os.Stderr, "Failed to load configuration: %v\n", err)
		os.Exit(1)
	}

	if *dryRun {
		if *modulesList == "" {
			fmt.Fprintln(os.Stderr, "--modules is required for dry-run")
			os.Exit(1)
		}
		if err := runDryRun(cfg, *modulesList, *workDirFlag); err != nil {
			logging.Error("Dry-run error: %v", err)
			fmt.Fprintf(os.Stderr, "Dry-run error: %v\n", err)
			os.Exit(1)
		}
		return
	}

	agent, err := agent.New(cfg)
	if err != nil {
		logging.Error("Failed to create agent: %v", err)
		fmt.Fprintf(os.Stderr, "Failed to initialize agent: %v\n", err)
		os.Exit(1)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, os.Signal(15)) // SIGTERM

	go func() {
		<-sigChan
		logging.Info("Received shutdown signal")
		cancel()
	}()

	if err := agent.Run(ctx); err != nil {
		logging.Error("Agent error: %v", err)
		fmt.Fprintf(os.Stderr, "Agent error: %v\n", err)
		os.Exit(1)
	}

	logging.Info("Agent stopped gracefully")
}

func runDryRun(cfg *config.Config, moduleIDs string, workDir string) error {
	if err := modules.Init(); err != nil {
		return fmt.Errorf("failed to initialize modules: %w", err)
	}

	ids := strings.Split(moduleIDs, ",")
	if workDir == "" {
		workDir = storage.GetWorkDir(".", fmt.Sprintf("dryrun-%d", time.Now().Unix()))
	}
	if err := storage.CreateWorkDir(workDir); err != nil {
		return err
	}

	var jobModules []api.JobModule
	for _, id := range ids {
		id = strings.TrimSpace(id)
		if id == "" {
			continue
		}
		moduleImpl, err := modules.GetModule(id)
		if err != nil {
			return err
		}
		outputter, ok := moduleImpl.(interface{ OutputRelPath() string })
		if !ok {
			return fmt.Errorf("module %s missing output path", id)
		}
		jobModules = append(jobModules, api.JobModule{
			ModuleID:      id,
			OutputRelPath: outputter.OutputRelPath(),
			Params:        map[string]interface{}{},
		})
	}

	executor := jobs.NewExecutor(cfg, nil)
	return executor.Run(context.Background(), "DRYRUN", "DRYRUN", workDir, jobModules)
}
