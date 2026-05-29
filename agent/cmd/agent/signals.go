package main

import (
	"context"
	"os"
	"os/signal"
	"syscall"

	"github.com/dfir/agent/internal/logging"
)

// watchSignals blocks until SIGINT or SIGTERM is received, then calls cancel.
func watchSignals(cancel context.CancelFunc) {
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, os.Interrupt, syscall.SIGTERM)
	sig := <-sigCh
	logging.Info("Received signal %v — shutting down gracefully", sig)
	cancel()
}
