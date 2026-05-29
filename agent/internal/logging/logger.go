package logging

import (
	"fmt"
	"io"
	"log"
	"os"
	"sync"
)

var (
	logger   *log.Logger
	once     sync.Once
	mu       sync.Mutex
	debug    bool
	quiet    bool
	logFile  *os.File
)

// Init initialises the logger using stdout only.
// Call InitWithOptions before any logging for file output.
func Init() {
	mu.Lock()
	defer mu.Unlock()
	once.Do(func() {
		debug = os.Getenv("DFIR_DEBUG") == "true"
		quiet = os.Getenv("DFIR_QUIET") == "true"
		logger = log.New(os.Stdout, "DFIR-AGENT: ", log.Ldate|log.Ltime)
	})
}

// InitWithOptions configures the logger with an optional log file and quiet mode.
// If logFilePath is set the logger writes to both stdout and the file.
// In quiet mode only the file receives output (stdout is suppressed).
func InitWithOptions(logFilePath string, quietMode bool) {
	mu.Lock()
	defer mu.Unlock()
	debug = os.Getenv("DFIR_DEBUG") == "true"
	quiet = quietMode

	var writers []io.Writer
	if !quiet {
		writers = append(writers, os.Stdout)
	}
	if logFilePath != "" {
		f, err := os.OpenFile(logFilePath, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0640)
		if err != nil {
			fmt.Fprintf(os.Stderr, "[WARN] Cannot open log file %s: %v — stdout only\n", logFilePath, err)
			if quiet {
				writers = append(writers, os.Stdout)
			}
		} else {
			logFile = f
			writers = append(writers, f)
		}
	}
	if len(writers) == 0 {
		writers = []io.Writer{io.Discard}
	}
	logger = log.New(io.MultiWriter(writers...), "DFIR-AGENT: ", log.Ldate|log.Ltime)
	once.Do(func() {}) // mark once done so Init() is a no-op after this
}

// Close flushes and closes the log file.
func Close() {
	mu.Lock()
	defer mu.Unlock()
	if logFile != nil {
		_ = logFile.Sync()
		_ = logFile.Close()
		logFile = nil
	}
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
