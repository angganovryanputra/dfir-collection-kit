package modules

import (
	"os"
	"testing"

	"github.com/dfir/agent/internal/logging"
)

func TestMain(m *testing.M) {
	logging.Init()
	os.Exit(m.Run())
}

func TestModuleRegistryResolution(t *testing.T) {
	if err := Init(); err != nil {
		t.Fatalf("init failed: %v", err)
	}

	module, err := GetModule("windows_eventlog_security")
	if err != nil {
		t.Fatalf("expected module, got error: %v", err)
	}

	outputter, ok := module.(interface{ OutputRelPath() string })
	if !ok {
		t.Fatalf("module does not expose OutputRelPath")
	}
	if outputter.OutputRelPath() == "" {
		t.Fatalf("expected output relpath")
	}

	if _, err := GetModule("missing_module"); err == nil {
		t.Fatalf("expected error for missing module")
	}
}
