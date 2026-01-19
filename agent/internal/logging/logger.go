package logging

import (
	"fmt"
	"log"
	"os"
	"sync"
	"time"
)

var (
	logger *log.Logger
	once   sync.Once
	debug   bool
)

// Init initializes the global logger
// Debug mode can be enabled via DFIR_DEBUG environment variable
func Init() {
	once.Do(func() {
		debug = os.Getenv("DFIR_DEBUG") == "true"

		logFlags := log.Ldate | log.Ltime | log.Lshortfile
		if debug {
			logFlags |= log.Lshortfile
		}

		logger = log.New(os.Stdout, "DFIR-AGENT: ", logFlags)
	})
}

// Info logs an informational message
func Info(format string, v ...interface{}) {
	logger.Output(2, fmt.Sprintf(format, v...))
}

// Debug logs a debug message (only when DFIR_DEBUG=true)
func Debug(format string, v ...interface{}) {
	if debug {
		logger.Output(2, fmt.Sprintf("[DEBUG] "+format, v...))
	}
}

// Warning logs a warning message
func Warning(format string, v ...interface{}) {
	logger.Output(2, fmt.Sprintf("[WARN] "+format, v...))
}

// Error logs an error message
func Error(format string, v ...interface{}) {
	logger.Output(2, fmt.Sprintf("[ERROR] "+format, v...))
}

// WithJob adds job context to log messages
func WithJob(jobID string) func(string, ...interface{}) string {
	return func(format string, v ...interface{}) string {
		args := make([]interface{}, 0, len(v)+1)
		args[0] = fmt.Sprintf("[JOB:%s]", jobID)
		copy(args, v)
		return fmt.Sprintf(format, args...)
	}
}
