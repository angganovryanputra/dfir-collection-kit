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

type JobLogger struct {
	jobID string
}

// WithJob adds job context to log messages
func WithJob(jobID string) JobLogger {
	return JobLogger{jobID: jobID}
}

func (j JobLogger) Info(format string, v ...interface{}) {
	Info("[JOB:%s] "+format, append([]interface{}{j.jobID}, v...)...)
}

func (j JobLogger) Debug(format string, v ...interface{}) {
	Debug("[JOB:%s] "+format, append([]interface{}{j.jobID}, v...)...)
}

func (j JobLogger) Warning(format string, v ...interface{}) {
	Warning("[JOB:%s] "+format, append([]interface{}{j.jobID}, v...)...)
}

func (j JobLogger) Error(format string, v ...interface{}) {
	Error("[JOB:%s] "+format, append([]interface{}{j.jobID}, v...)...)
}
