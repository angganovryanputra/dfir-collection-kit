// Package config loads agent configuration from CLI flags, config file, and
// environment variables — in that priority order (flags > file > env > default).
//
// Portability model (Windows enterprise):
//
//	Copy dfir-agent.exe + dfir-agent.conf to target.
//	Run: dfir-agent.exe  (no installer, no registry, no env vars needed)
//
// Config file format (dfir-agent.conf, key = value, # for comments):
//
//	backend         = https://dfir.corp.com/api/v1
//	secret          = strong-shared-secret
//	tls_skip_verify = true       ; behind SSL-inspection proxies (Zscaler etc.)
//	ca_cert         = corp-ca.pem ; custom root CA bundle
//	proxy           = http://proxy.corp.com:8080
//	hostname        = DC01
//	log_file        = C:\Windows\Temp\dfir-agent.log
package config

import (
	"bufio"
	"crypto/rand"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
)

const (
	DefaultHeartbeatInterval = 30
	DefaultPollInterval      = 15
	DefaultJitterPercent     = 30
	DefaultConnectTimeoutSec = 10
	DefaultUploadTimeoutMin  = 120  // 2 hours — enough for large evidence ZIPs on WAN
	DefaultMaxRetries        = 0    // 0 = retry forever until registration succeeds
	DefaultRetryIntervalSec  = 15
	AgentIDFile              = "agent_id.json"
	DefaultBackendURL        = "http://localhost:8000/api/v1"
	ConfigFileName           = "dfir-agent.conf"
)

// Config holds all agent configuration.
type Config struct {
	// Core connectivity
	BackendURL        string
	AgentSharedSecret string
	AgentID           string
	Hostname          string
	IPAddress         string
	Type              string
	OS                string
	OSVersion         string
	AgentVersion      string

	// Poll / heartbeat timing
	HeartbeatInterval int
	PollInterval      int
	JitterPercent     int // ±% randomisation for OPSEC

	// Network / TLS (enterprise critical)
	TLSSkipVerify bool   // accept self-signed / corp-intercepted TLS
	TLSCACertPath string // extra root CA bundle .pem (corporate PKI)
	ProxyURL      string // explicit proxy, e.g. http://proxy.corp.com:8080

	// Timeouts
	ConnectTimeoutSec int // TCP dial timeout (seconds)
	UploadTimeoutMin  int // evidence upload timeout (0 = no limit)

	// Retry on registration failure (boot-time network not ready)
	MaxRetries       int // 0 = retry forever
	RetryIntervalSec int

	// Portable storage paths
	DataDir string // agent_id.json storage (default: directory of binary)
	WorkDir string // base dir for collection workdirs (default: OS temp)

	// Logging
	LogFile string // empty = stdout only; set for Windows Service / SCCM runs
	Quiet   bool   // suppress non-critical stdout

	// Behaviour
	NoRegister bool // skip backend registration (offline testing)
	PingMode   bool // test connectivity then exit
}

// Flags wraps pointers returned by flag.FlagSet to avoid nil-dereference.
type Flags struct {
	Backend       *string
	Secret        *string
	AgentID       *string
	Hostname      *string
	AgentType     *string
	TLSSkipVerify *bool
	CACert        *string
	Proxy         *string
	DataDir       *string
	WorkDir       *string
	LogFile       *string
	Quiet         *bool
	NoRegister    *bool
	Ping          *bool
	ConfigFile    *string
	UploadTimeout *int
	// Dry-run flags (handled in main)
	DryRun        *bool
	DryRunModules *string
	DryRunWorkDir *string
}

// RegisterFlags adds all agent flags to fs and returns their value pointers.
func RegisterFlags(fs *flag.FlagSet) *Flags {
	return &Flags{
		Backend:       fs.String("backend", "", "Backend API URL (e.g. https://dfir.corp.com/api/v1)"),
		Secret:        fs.String("secret", "", "Agent shared secret (required unless in config file or env)"),
		AgentID:       fs.String("id", "", "Override agent ID (default: auto-generated and persisted)"),
		Hostname:      fs.String("hostname", "", "Override hostname sent to backend"),
		AgentType:     fs.String("type", "", "Agent type label: workstation|server|dc"),
		TLSSkipVerify: fs.Bool("tls-skip-verify", false, "Disable TLS certificate verification (use behind SSL-inspection proxies)"),
		CACert:        fs.String("ca-cert", "", "Path to custom root CA bundle (.pem) — for corporate PKI"),
		Proxy:         fs.String("proxy", "", "Explicit proxy URL (e.g. http://proxy.corp.com:8080)"),
		DataDir:       fs.String("data-dir", "", "Directory for agent state files (default: same dir as binary)"),
		WorkDir:       fs.String("work-dir", "", "Base dir for collection workdirs (default: OS temp)"),
		LogFile:       fs.String("log-file", "", "Write logs to this file (recommended for Windows Service / SCCM)"),
		Quiet:         fs.Bool("quiet", false, "Suppress non-critical stdout output"),
		NoRegister:    fs.Bool("no-register", false, "Skip backend registration (offline / testing mode)"),
		Ping:          fs.Bool("ping", false, "Test backend connectivity and exit"),
		ConfigFile:    fs.String("config", "", "Config file path (default: dfir-agent.conf next to binary)"),
		UploadTimeout: fs.Int("upload-timeout", DefaultUploadTimeoutMin, "Evidence upload timeout in minutes (0 = no limit)"),
		DryRun:        fs.Bool("dry-run", false, "Run modules locally without contacting backend"),
		DryRunModules: fs.String("modules", "", "Comma-separated module IDs for dry-run"),
		DryRunWorkDir: fs.String("workdir", "", "Work directory for dry-run output"),
	}
}

// Load builds Config by merging flags → config file → env vars → defaults.
func Load(f *Flags) (*Config, error) {
	fileCfg, err := resolveAndParseConfigFile(f)
	if err != nil {
		return nil, err
	}

	// ── Merge helpers ────────────────────────────────────────────────────────
	str := func(flg *string, fileKey, envKey, def string) string {
		if flg != nil && *flg != "" {
			return *flg
		}
		if v, ok := fileCfg[fileKey]; ok && v != "" {
			return v
		}
		if v := os.Getenv(envKey); v != "" {
			return v
		}
		return def
	}
	boolv := func(flg *bool, fileKey, envKey string, def bool) bool {
		if flg != nil && *flg {
			return true
		}
		if v, ok := fileCfg[fileKey]; ok {
			b, _ := strconv.ParseBool(strings.TrimSpace(v))
			return b
		}
		if v := os.Getenv(envKey); v != "" {
			b, _ := strconv.ParseBool(v)
			return b
		}
		return def
	}
	intv := func(flg *int, fileKey, envKey string, def int) int {
		if flg != nil && *flg != def {
			return *flg
		}
		if v, ok := fileCfg[fileKey]; ok && v != "" {
			if n, err := strconv.Atoi(strings.TrimSpace(v)); err == nil {
				return n
			}
		}
		if v := os.Getenv(envKey); v != "" {
			if n, err := strconv.Atoi(v); err == nil {
				return n
			}
		}
		return def
	}

	// ── Secret (required) ────────────────────────────────────────────────────
	secret := str(f.Secret, "secret", "DFIR_AGENT_SECRET", "")
	if secret == "" {
		return nil, errors.New(
			"agent secret is required.\n" +
				"  Options:\n" +
				"    1. Flag:       dfir-agent -secret YOUR_SECRET\n" +
				"    2. Config:     secret = YOUR_SECRET  (in dfir-agent.conf)\n" +
				"    3. Env var:    set DFIR_AGENT_SECRET=YOUR_SECRET",
		)
	}

	// ── Portable data directory ───────────────────────────────────────────────
	// Priority: --data-dir flag → config data_dir → DFIR_DATA_DIR env
	//           → directory of running binary → ~/.dfir-agent/ last resort
	dataDir := str(f.DataDir, "data_dir", "DFIR_DATA_DIR", "")
	if dataDir == "" {
		if exe, err := os.Executable(); err == nil {
			dataDir = filepath.Dir(exe)
		}
	}
	if dataDir == "" {
		home, _ := os.UserHomeDir()
		dataDir = filepath.Join(home, ".dfir-agent")
	}
	if mkErr := os.MkdirAll(dataDir, 0750); mkErr != nil {
		// Non-fatal — agent will still work, just ID won't persist
		fmt.Fprintf(os.Stderr, "[WARN] Cannot create data dir %s: %v\n", dataDir, mkErr)
	}

	// ── Agent ID ──────────────────────────────────────────────────────────────
	idOverride := str(f.AgentID, "agent_id", "DFIR_AGENT_ID", "")
	agentID, err := loadOrGenerateAgentID(dataDir, idOverride)
	if err != nil {
		return nil, fmt.Errorf("agent ID: %w", err)
	}

	return &Config{
		BackendURL:        str(f.Backend, "backend", "DFIR_BACKEND_URL", DefaultBackendURL),
		AgentSharedSecret: secret,
		AgentID:           agentID,
		Hostname:          str(f.Hostname, "hostname", "DFIR_HOSTNAME", ""),
		IPAddress:         str(nil, "ip_address", "DFIR_IP_ADDRESS", ""),
		Type:              str(f.AgentType, "type", "DFIR_TYPE", ""),
		OS:                detectOSName(),
		OSVersion:         detectOSVersion(),
		AgentVersion:      "1.0.0",
		HeartbeatInterval: DefaultHeartbeatInterval,
		PollInterval:      DefaultPollInterval,
		JitterPercent:     DefaultJitterPercent,

		TLSSkipVerify:    boolv(f.TLSSkipVerify, "tls_skip_verify", "DFIR_TLS_SKIP_VERIFY", false),
		TLSCACertPath:    str(f.CACert, "ca_cert", "DFIR_TLS_CA_CERT", ""),
		ProxyURL:         str(f.Proxy, "proxy", "DFIR_PROXY", ""),
		ConnectTimeoutSec: intv(nil, "connect_timeout", "DFIR_CONNECT_TIMEOUT", DefaultConnectTimeoutSec),
		UploadTimeoutMin: intv(f.UploadTimeout, "upload_timeout_min", "DFIR_UPLOAD_TIMEOUT_MIN", DefaultUploadTimeoutMin),
		MaxRetries:       intv(nil, "max_retries", "DFIR_MAX_RETRIES", DefaultMaxRetries),
		RetryIntervalSec: intv(nil, "retry_interval", "DFIR_RETRY_INTERVAL", DefaultRetryIntervalSec),

		DataDir: dataDir,
		WorkDir: str(f.WorkDir, "work_dir", "DFIR_WORK_DIR", ""),
		LogFile: str(f.LogFile, "log_file", "DFIR_LOG_FILE", ""),
		Quiet:   boolv(f.Quiet, "quiet", "DFIR_QUIET", false),

		NoRegister: boolv(f.NoRegister, "no_register", "DFIR_NO_REGISTER", false),
		PingMode:   f.Ping != nil && *f.Ping,
	}, nil
}

// LoadDryRun builds a minimal config for offline local module execution.
func LoadDryRun(f *Flags) (*Config, error) {
	dataDir := ""
	if f.DataDir != nil && *f.DataDir != "" {
		dataDir = *f.DataDir
	} else if exe, err := os.Executable(); err == nil {
		dataDir = filepath.Dir(exe)
	}
	if dataDir == "" {
		home, _ := os.UserHomeDir()
		dataDir = filepath.Join(home, ".dfir-agent")
	}
	_ = os.MkdirAll(dataDir, 0750)

	agentID, _ := loadOrGenerateAgentID(dataDir, "")
	return &Config{
		AgentSharedSecret: "dry-run",
		AgentID:           agentID,
		OS:                detectOSName(),
		OSVersion:         detectOSVersion(),
		AgentVersion:      "1.0.0",
		HeartbeatInterval: DefaultHeartbeatInterval,
		PollInterval:      DefaultPollInterval,
		JitterPercent:     DefaultJitterPercent,
		DataDir:           dataDir,
		UploadTimeoutMin:  DefaultUploadTimeoutMin,
		RetryIntervalSec:  DefaultRetryIntervalSec,
		ConnectTimeoutSec: DefaultConnectTimeoutSec,
	}, nil
}

// ── Config file parser ────────────────────────────────────────────────────────

func resolveAndParseConfigFile(f *Flags) (map[string]string, error) {
	var cfgPath string
	if f.ConfigFile != nil && *f.ConfigFile != "" {
		cfgPath = *f.ConfigFile
	} else if exe, err := os.Executable(); err == nil {
		candidate := filepath.Join(filepath.Dir(exe), ConfigFileName)
		if _, err := os.Stat(candidate); err == nil {
			cfgPath = candidate
		}
	}
	if cfgPath == "" {
		return map[string]string{}, nil
	}
	return parseConfigFile(cfgPath)
}

func parseConfigFile(path string) (map[string]string, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	result := map[string]string{}
	scanner := bufio.NewScanner(f)
	lineNo := 0
	for scanner.Scan() {
		lineNo++
		line := strings.TrimSpace(scanner.Text())
		if line == "" || line[0] == '#' || line[0] == ';' {
			continue
		}
		idx := strings.IndexByte(line, '=')
		if idx < 0 {
			return nil, fmt.Errorf("line %d: expected 'key = value', got %q", lineNo, line)
		}
		key := strings.TrimSpace(line[:idx])
		val := strings.TrimSpace(line[idx+1:])
		// Strip inline comments (# and ;)
		for _, sep := range []string{" #", " ;"} {
			if ci := strings.Index(val, sep); ci >= 0 {
				val = strings.TrimSpace(val[:ci])
			}
		}
		result[key] = val
	}
	return result, scanner.Err()
}

// ── Agent ID persistence ──────────────────────────────────────────────────────

func loadOrGenerateAgentID(dataDir, override string) (string, error) {
	idPath := filepath.Join(dataDir, AgentIDFile)

	if override != "" {
		_ = os.WriteFile(idPath, []byte(override), 0600)
		return override, nil
	}

	// Read persisted ID — support both plain string and {"agent_id":"..."} JSON
	if data, err := os.ReadFile(idPath); err == nil {
		id := strings.TrimSpace(string(data))
		if strings.HasPrefix(id, "{") {
			var jf struct {
				AgentID string `json:"agent_id"`
			}
			if json.Unmarshal(data, &jf) == nil && jf.AgentID != "" {
				return jf.AgentID, nil
			}
		}
		if id != "" {
			return id, nil
		}
	}

	agentID, err := generateUUID()
	if err != nil {
		return "", fmt.Errorf("failed to generate agent ID: %w", err)
	}
	if writeErr := os.WriteFile(idPath, []byte(agentID), 0600); writeErr != nil {
		fmt.Fprintf(os.Stderr, "[WARN] Cannot persist agent ID to %s: %v (ID will regenerate on restart)\n",
			idPath, writeErr)
	}
	return agentID, nil
}

// ── OS detection ──────────────────────────────────────────────────────────────

func detectOSVersion() string {
	arch := runtime.GOARCH
	switch runtime.GOOS {
	case "windows":
		return fmt.Sprintf("Windows %s (%s)", getWindowsVersion(), arch)
	case "linux":
		return fmt.Sprintf("%s (%s)", getLinuxDistro(), arch)
	default:
		return fmt.Sprintf("%s (%s)", runtime.GOOS, arch)
	}
}

func detectOSName() string { return fmt.Sprintf("%s/%s", runtime.GOOS, runtime.GOARCH) }

func getWindowsVersion() string { return "10/11" }

func getLinuxDistro() string {
	data, err := os.ReadFile("/etc/os-release")
	if err != nil {
		return "Generic Linux"
	}
	for _, line := range strings.Split(string(data), "\n") {
		if strings.HasPrefix(line, "PRETTY_NAME=") {
			name := strings.Trim(strings.TrimPrefix(line, "PRETTY_NAME="), `"`)
			if name != "" {
				return name
			}
		}
	}
	return "Generic Linux"
}

func generateUUID() (string, error) {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", err
	}
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x",
		b[0:4], b[4:6], b[6:8], b[8:10], b[10:]), nil
}
