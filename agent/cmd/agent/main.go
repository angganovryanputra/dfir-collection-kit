// DFIR Agent — portable forensic collection agent.
//
// Portable Windows deployment (no installer, no env vars):
//
//	dfir-agent.exe -backend https://dfir.corp.com/api/v1 -secret MySecret
//
// Or drop dfir-agent.conf next to the binary and run without flags:
//
//	backend = https://dfir.corp.com/api/v1
//	secret  = MySecret
//
// Behind SSL-inspection proxy (Zscaler, BlueCoat, Cisco NGFW):
//
//	dfir-agent.exe -tls-skip-verify
//	dfir-agent.exe -ca-cert C:\path\to\corp-ca.pem
//
// Explicit corporate proxy:
//
//	dfir-agent.exe -proxy http://proxy.corp.com:8080
//
// Offline / dry-run (no backend required):
//
//	dfir-agent.exe -dry-run -modules windows_process_list,windows_prefetch
//
// Test connectivity only:
//
//	dfir-agent.exe -ping
package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/dfir/agent/internal/agent"
	"github.com/dfir/agent/internal/api"
	"github.com/dfir/agent/internal/config"
	"github.com/dfir/agent/internal/jobs"
	"github.com/dfir/agent/internal/logging"
	"github.com/dfir/agent/internal/modules"
	"github.com/dfir/agent/internal/parsers"
	"github.com/dfir/agent/internal/storage"
)

const (
	ProgramName = "dfir-agent"
	Version     = "1.1.0"
)

func main() {
	fs := flag.NewFlagSet(os.Args[0], flag.ExitOnError)
	f := config.RegisterFlags(fs)

	fs.Usage = func() {
		fmt.Fprintf(os.Stderr, "%s v%s — DFIR portable collection agent\n\n", ProgramName, Version)
		fmt.Fprintf(os.Stderr, "Usage: %s [flags]\n\n", os.Args[0])
		fmt.Fprintf(os.Stderr, "Quick start:\n")
		fmt.Fprintf(os.Stderr, "  %s.exe -backend https://dfir.corp.com/api/v1 -secret MySecret\n\n", ProgramName)
		fmt.Fprintf(os.Stderr, "SSL-inspection proxy:\n")
		fmt.Fprintf(os.Stderr, "  %s.exe -tls-skip-verify    (or -ca-cert corp-ca.pem)\n\n", ProgramName)
		fmt.Fprintf(os.Stderr, "Offline dry-run:\n")
		fmt.Fprintf(os.Stderr, "  %s.exe -dry-run -modules windows_process_list,windows_prefetch\n\n", ProgramName)
		fmt.Fprintf(os.Stderr, "Flags:\n")
		fs.PrintDefaults()
	}

	if err := fs.Parse(os.Args[1:]); err != nil {
		os.Exit(1)
	}

	fmt.Printf("%s v%s\n", ProgramName, Version)

	// ── Dry-run mode ─────────────────────────────────────────────────────
	if f.DryRun != nil && *f.DryRun {
		cfg, err := config.LoadDryRun(f)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Config error: %v\n", err)
			os.Exit(1)
		}
		logging.InitWithOptions(cfg.LogFile, cfg.Quiet)
		defer logging.Close()
		if err := runDryRun(cfg, f); err != nil {
			logging.Error("Dry-run error: %v", err)
			os.Exit(1)
		}
		return
	}

	// ── Load config ───────────────────────────────────────────────────────
	cfg, err := config.Load(f)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Configuration error:\n  %v\n\nRun with -h for help.\n", err)
		os.Exit(1)
	}

	logging.InitWithOptions(cfg.LogFile, cfg.Quiet)
	defer logging.Close()

	logging.Info("%s v%s starting", ProgramName, Version)

	if err := modules.Init(); err != nil {
		logging.Error("Failed to initialize modules: %v", err)
		os.Exit(1)
	}
	parsers.Init()

	// ── Ping mode ─────────────────────────────────────────────────────────
	if cfg.PingMode {
		if err := runPing(cfg); err != nil {
			fmt.Fprintf(os.Stderr, "FAIL: %v\n", err)
			os.Exit(1)
		}
		fmt.Printf("OK: backend reachable at %s\n", cfg.BackendURL)
		return
	}

	// ── Normal agent mode ─────────────────────────────────────────────────
	a, err := agent.New(cfg)
	if err != nil {
		logging.Error("Failed to create agent: %v", err)
		os.Exit(1)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	go watchSignals(cancel)

	if err := a.Run(ctx); err != nil {
		logging.Error("Agent error: %v", err)
		os.Exit(1)
	}
	logging.Info("Agent stopped gracefully")
}

// runPing verifies backend reachability using the configured TLS / proxy settings.
func runPing(cfg *config.Config) error {
	client, err := api.NewClient(cfg)
	if err != nil {
		return fmt.Errorf("build HTTP client: %w", err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	if err := client.Ping(ctx); err != nil {
		return fmt.Errorf("backend %s unreachable: %w", cfg.BackendURL, err)
	}
	logging.Info("Ping OK → %s (TLS-skip=%v, proxy=%q)", cfg.BackendURL, cfg.TLSSkipVerify, cfg.ProxyURL)
	return nil
}

// runDryRun executes modules locally and writes output to a workdir.
func runDryRun(cfg *config.Config, f *config.Flags) error {
	if err := modules.Init(); err != nil {
		return fmt.Errorf("init modules: %w", err)
	}
	parsers.Init()

	moduleList := ""
	if f.DryRunModules != nil {
		moduleList = *f.DryRunModules
	}
	if moduleList == "" {
		return fmt.Errorf("--modules required for dry-run (e.g. --modules windows_process_list,windows_prefetch)")
	}

	workDir := ""
	if f.DryRunWorkDir != nil {
		workDir = *f.DryRunWorkDir
	}
	if workDir == "" {
		workDir = storage.GetWorkDir(".", fmt.Sprintf("dryrun-%d", time.Now().Unix()))
	}
	if err := storage.CreateWorkDir(workDir); err != nil {
		return err
	}
	logging.Info("Output directory: %s", workDir)

	var jobModules []api.JobModule
	for _, id := range strings.Split(moduleList, ",") {
		id = strings.TrimSpace(id)
		if id == "" {
			continue
		}
		impl, err := modules.GetModule(id)
		if err != nil {
			return fmt.Errorf("unknown module %q", id)
		}
		type outpath interface{ OutputRelPath() string }
		op, ok := impl.(outpath)
		if !ok {
			return fmt.Errorf("module %s has no output path", id)
		}
		jobModules = append(jobModules, api.JobModule{
			ModuleID:      id,
			OutputRelPath: op.OutputRelPath(),
			Params:        map[string]interface{}{},
		})
	}

	executor := jobs.NewExecutor(cfg, nil)
	return executor.Run(context.Background(), "DRYRUN", "DRYRUN", workDir, jobModules, 0, 5, 0)
}
