package main

import (
	"context"
	"fmt"
	"os"
	"os/signal"

	"github.com/dfir/agent/internal/agent"
	"github.com/dfir/agent/internal/config"
	"github.com/dfir/agent/internal/logging"
)

const (
	// Program name and version
	ProgramName = "dfir-agent"
	Version    = "1.0.0"
)

func main() {
	logging.Init()

	fmt.Printf("%s v%s\n", ProgramName, Version)
	logging.Info("Starting DFIR Agent")

	cfg, err := config.Load()
	if err != nil {
		logging.Error("Configuration error: %v", err)
		fmt.Fprintf(os.Stderr, "Failed to load configuration: %v\n", err)
		os.Exit(1)
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
