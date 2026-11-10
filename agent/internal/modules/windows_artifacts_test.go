package modules

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestCopyNative_CaseInsensitive(t *testing.T) {
	ctx := context.Background()
	srcDir := t.TempDir()
	dstDir := t.TempDir()

	// Create test files with mixed casing
	files := map[string]string{
		"ntuser.dat":      "primary ntuser content",
		"NTUSER.DAT.LOG1": "log 1 content",
		"ntuser.dat.log2": "log 2 content",
		"NTUSER.DAT.LOG":  "log content",
		"other.txt":       "unrelated content",
	}
	for name, content := range files {
		if err := os.WriteFile(filepath.Join(srcDir, name), []byte(content), 0644); err != nil {
			t.Fatalf("failed to create test file %s: %v", name, err)
		}
	}

	// 1. Exact match with different casing (pattern: NTUSER.DAT, file: ntuser.dat)
	if err := copyNative(ctx, srcDir, "NTUSER.DAT", dstDir); err != nil {
		t.Fatalf("copyNative for NTUSER.DAT failed: %v", err)
	}
	copiedData, err := os.ReadFile(filepath.Join(dstDir, "ntuser.dat"))
	if err != nil {
		t.Fatalf("failed to read copied ntuser.dat: %v", err)
	}
	if string(copiedData) != "primary ntuser content" {
		t.Errorf("unexpected content: %s", string(copiedData))
	}

	// 2. Pattern match for companion logs (pattern: NTUSER.DAT.LOG*)
	if err := copyNative(ctx, srcDir, "NTUSER.DAT.LOG*", dstDir); err != nil {
		t.Fatalf("copyNative for NTUSER.DAT.LOG* failed: %v", err)
	}
	for _, expected := range []string{"NTUSER.DAT.LOG1", "ntuser.dat.log2", "NTUSER.DAT.LOG"} {
		if _, err := os.Stat(filepath.Join(dstDir, expected)); err != nil {
			t.Errorf("expected companion log %s was not copied: %v", expected, err)
		}
	}

	// 3. Non-matching pattern returns error
	if err := copyNative(ctx, srcDir, "nonexistent*.dat", dstDir); err == nil {
		t.Errorf("expected error for non-matching pattern, got nil")
	}
}

func TestCollectSystemHives_WithCompanionLogs(t *testing.T) {
	ctx := context.Background()
	srcDir := t.TempDir()
	outDir := t.TempDir()

	testFiles := map[string]string{
		"SYSTEM":        "system-hive-data",
		"SYSTEM.LOG1":   "system-log1-data",
		"SYSTEM.LOG2":   "system-log2-data",
		"SYSTEM.LOG":    "system-log-data",
		"SOFTWARE":      "software-hive-data",
		"SOFTWARE.LOG1": "software-log1-data",
		"SAM":           "sam-hive-data",
		"SECURITY":      "security-hive-data",
		"SECURITY.LOG1": "security-log1-data",
	}
	for name, content := range testFiles {
		if err := os.WriteFile(filepath.Join(srcDir, name), []byte(content), 0644); err != nil {
			t.Fatalf("failed to write %s: %v", name, err)
		}
	}

	hives := []RegistryHiveTarget{
		{Name: "SYSTEM", Path: filepath.Join(srcDir, "SYSTEM")},
		{Name: "SOFTWARE", Path: filepath.Join(srcDir, "SOFTWARE")},
		{Name: "SAM", Path: filepath.Join(srcDir, "SAM")},
		{Name: "SECURITY", Path: filepath.Join(srcDir, "SECURITY")},
	}

	errs := collectSystemHives(ctx, hives, outDir)
	if len(errs) != 0 {
		t.Fatalf("expected 0 errors, got: %v", errs)
	}

	// Verify all primary hives and companion logs exist in outDir
	expectedFiles := []string{
		"SYSTEM", "SYSTEM.LOG1", "SYSTEM.LOG2", "SYSTEM.LOG",
		"SOFTWARE", "SOFTWARE.LOG1",
		"SAM",
		"SECURITY", "SECURITY.LOG1",
	}
	for _, name := range expectedFiles {
		data, err := os.ReadFile(filepath.Join(outDir, name))
		if err != nil {
			t.Errorf("expected file %s was not copied: %v", name, err)
			continue
		}
		if string(data) != testFiles[name] {
			t.Errorf("content mismatch for %s: got %s, want %s", name, string(data), testFiles[name])
		}
	}
}

func TestCollectSystemHives_MissingCompanionLogsNonFatal(t *testing.T) {
	ctx := context.Background()
	srcDir := t.TempDir()
	outDir := t.TempDir()

	// Only primary hives, no .LOG1, .LOG2, or .LOG
	for _, name := range []string{"SYSTEM", "SOFTWARE", "SAM", "SECURITY"} {
		if err := os.WriteFile(filepath.Join(srcDir, name), []byte(name+"-data"), 0644); err != nil {
			t.Fatalf("failed to write %s: %v", name, err)
		}
	}

	hives := []RegistryHiveTarget{
		{Name: "SYSTEM", Path: filepath.Join(srcDir, "SYSTEM")},
		{Name: "SOFTWARE", Path: filepath.Join(srcDir, "SOFTWARE")},
		{Name: "SAM", Path: filepath.Join(srcDir, "SAM")},
		{Name: "SECURITY", Path: filepath.Join(srcDir, "SECURITY")},
	}

	errs := collectSystemHives(ctx, hives, outDir)
	if len(errs) != 0 {
		t.Fatalf("expected 0 errors when companion logs are missing, got: %v", errs)
	}

	for _, name := range []string{"SYSTEM", "SOFTWARE", "SAM", "SECURITY"} {
		if _, err := os.Stat(filepath.Join(outDir, name)); err != nil {
			t.Errorf("primary hive %s missing in output: %v", name, err)
		}
	}
}

func TestCollectSystemHives_MissingMainHiveReportsError(t *testing.T) {
	ctx := context.Background()
	srcDir := t.TempDir()
	outDir := t.TempDir()

	// SYSTEM exists with SYSTEM.LOG1; SAM does not exist
	if err := os.WriteFile(filepath.Join(srcDir, "SYSTEM"), []byte("system-data"), 0644); err != nil {
		t.Fatalf("failed to write SYSTEM: %v", err)
	}
	if err := os.WriteFile(filepath.Join(srcDir, "SYSTEM.LOG1"), []byte("system-log1"), 0644); err != nil {
		t.Fatalf("failed to write SYSTEM.LOG1: %v", err)
	}

	hives := []RegistryHiveTarget{
		{Name: "SYSTEM", Path: filepath.Join(srcDir, "SYSTEM")},
		{Name: "SAM", Path: filepath.Join(srcDir, "SAM")}, // non-existent
	}

	errs := collectSystemHives(ctx, hives, outDir)
	if len(errs) != 1 {
		t.Fatalf("expected exactly 1 error for missing SAM, got %d: %v", len(errs), errs)
	}
	if !strings.Contains(errs[0], "SAM") {
		t.Errorf("expected error to mention SAM, got: %s", errs[0])
	}

	// SYSTEM and its companion log should still be copied
	if _, err := os.Stat(filepath.Join(outDir, "SYSTEM")); err != nil {
		t.Errorf("SYSTEM was not copied: %v", err)
	}
	if _, err := os.Stat(filepath.Join(outDir, "SYSTEM.LOG1")); err != nil {
		t.Errorf("SYSTEM.LOG1 was not copied: %v", err)
	}
}

func TestCollectNtuserDatProfiles_WithCompanionLogs(t *testing.T) {
	ctx := context.Background()
	baseDir := t.TempDir()
	outDir := t.TempDir()

	// Setup profile 'alice' (standard uppercase/mixed)
	aliceDir := filepath.Join(baseDir, "Alice")
	aliceUsrClassDir := filepath.Join(aliceDir, "AppData", "Local", "Microsoft", "Windows")
	if err := os.MkdirAll(aliceUsrClassDir, 0755); err != nil {
		t.Fatalf("failed to create alice dirs: %v", err)
	}
	aliceFiles := map[string]string{
		filepath.Join(aliceDir, "NTUSER.DAT"):           "alice-ntuser",
		filepath.Join(aliceDir, "NTUSER.DAT.LOG1"):      "alice-ntuser-log1",
		filepath.Join(aliceDir, "NTUSER.DAT.LOG2"):      "alice-ntuser-log2",
		filepath.Join(aliceDir, "NTUSER.DAT.LOG"):       "alice-ntuser-log",
		filepath.Join(aliceUsrClassDir, "UsrClass.dat"):      "alice-usrclass",
		filepath.Join(aliceUsrClassDir, "UsrClass.dat.LOG1"): "alice-usrclass-log1",
		filepath.Join(aliceUsrClassDir, "UsrClass.dat.LOG2"): "alice-usrclass-log2",
	}
	for p, content := range aliceFiles {
		if err := os.WriteFile(p, []byte(content), 0644); err != nil {
			t.Fatalf("failed to write %s: %v", p, err)
		}
	}

	// Setup profile 'bob' (lowercase filenames)
	bobDir := filepath.Join(baseDir, "Bob")
	bobUsrClassDir := filepath.Join(bobDir, "AppData", "Local", "Microsoft", "Windows")
	if err := os.MkdirAll(bobUsrClassDir, 0755); err != nil {
		t.Fatalf("failed to create bob dirs: %v", err)
	}
	bobFiles := map[string]string{
		filepath.Join(bobDir, "ntuser.dat"):                  "bob-ntuser",
		filepath.Join(bobDir, "ntuser.dat.log1"):             "bob-ntuser-log1",
		filepath.Join(bobUsrClassDir, "usrclass.dat"):      "bob-usrclass",
		filepath.Join(bobUsrClassDir, "usrclass.dat.log1"): "bob-usrclass-log1",
	}
	for p, content := range bobFiles {
		if err := os.WriteFile(p, []byte(content), 0644); err != nil {
			t.Fatalf("failed to write %s: %v", p, err)
		}
	}

	errs := collectNtuserDatProfiles(ctx, []string{aliceDir, bobDir}, outDir)
	if len(errs) != 0 {
		t.Fatalf("expected 0 errors, got: %v", errs)
	}

	// Check Alice artifacts
	for _, name := range []string{
		"NTUSER.DAT", "NTUSER.DAT.LOG1", "NTUSER.DAT.LOG2", "NTUSER.DAT.LOG",
		"UsrClass.dat", "UsrClass.dat.LOG1", "UsrClass.dat.LOG2",
	} {
		p := filepath.Join(outDir, "Alice", name)
		if _, err := os.Stat(p); err != nil {
			t.Errorf("Alice artifact %s missing: %v", name, err)
		}
	}

	// Check Bob artifacts (copied with preserved case)
	for _, name := range []string{
		"ntuser.dat", "ntuser.dat.log1",
		"usrclass.dat", "usrclass.dat.log1",
	} {
		p := filepath.Join(outDir, "Bob", name)
		if _, err := os.Stat(p); err != nil {
			t.Errorf("Bob artifact %s missing: %v", name, err)
		}
	}
}

func TestCollectNtuserDatProfiles_MissingCompanionLogsNonFatal(t *testing.T) {
	ctx := context.Background()
	baseDir := t.TempDir()
	outDir := t.TempDir()

	profileDir := filepath.Join(baseDir, "Charlie")
	usrClassDir := filepath.Join(profileDir, "AppData", "Local", "Microsoft", "Windows")
	if err := os.MkdirAll(usrClassDir, 0755); err != nil {
		t.Fatalf("failed to create dirs: %v", err)
	}

	if err := os.WriteFile(filepath.Join(profileDir, "NTUSER.DAT"), []byte("charlie-ntuser"), 0644); err != nil {
		t.Fatalf("failed to write NTUSER.DAT: %v", err)
	}
	if err := os.WriteFile(filepath.Join(usrClassDir, "UsrClass.dat"), []byte("charlie-usrclass"), 0644); err != nil {
		t.Fatalf("failed to write UsrClass.dat: %v", err)
	}

	errs := collectNtuserDatProfiles(ctx, []string{profileDir}, outDir)
	if len(errs) != 0 {
		t.Fatalf("expected 0 errors when companion logs are missing, got: %v", errs)
	}

	if _, err := os.Stat(filepath.Join(outDir, "Charlie", "NTUSER.DAT")); err != nil {
		t.Errorf("NTUSER.DAT missing: %v", err)
	}
	if _, err := os.Stat(filepath.Join(outDir, "Charlie", "UsrClass.dat")); err != nil {
		t.Errorf("UsrClass.dat missing: %v", err)
	}
}

func TestCollectNtuserDatProfiles_MissingNtuserDatReportsError(t *testing.T) {
	ctx := context.Background()
	baseDir := t.TempDir()
	outDir := t.TempDir()

	profileDir := filepath.Join(baseDir, "Dave")
	usrClassDir := filepath.Join(profileDir, "AppData", "Local", "Microsoft", "Windows")
	if err := os.MkdirAll(usrClassDir, 0755); err != nil {
		t.Fatalf("failed to create dirs: %v", err)
	}
	// No NTUSER.DAT created in Dave's profile dir, but UsrClass.dat is present
	if err := os.WriteFile(filepath.Join(usrClassDir, "UsrClass.dat"), []byte("dave-usrclass"), 0644); err != nil {
		t.Fatalf("failed to write UsrClass.dat: %v", err)
	}

	errs := collectNtuserDatProfiles(ctx, []string{profileDir}, outDir)
	if len(errs) != 1 {
		t.Fatalf("expected 1 error for missing NTUSER.DAT, got %d: %v", len(errs), errs)
	}
	if !strings.Contains(errs[0], "Dave NTUSER.DAT") {
		t.Errorf("expected error to mention 'Dave NTUSER.DAT', got: %s", errs[0])
	}

	// UsrClass.dat should still have been collected
	if _, err := os.Stat(filepath.Join(outDir, "Dave", "UsrClass.dat")); err != nil {
		t.Errorf("UsrClass.dat should still be collected: %v", err)
	}
}

func TestRegistryModuleMetadata(t *testing.T) {
	hivesMod := NewWindowsRegistryHives()
	if hivesMod.Name() != "windows_registry_hives" {
		t.Errorf("unexpected name: %s", hivesMod.Name())
	}
	if hivesMod.OutputRelPath() != "artifacts/windows/registry/" {
		t.Errorf("unexpected rel path: %s", hivesMod.OutputRelPath())
	}

	ntuserMod := NewWindowsNtuserDat()
	if ntuserMod.Name() != "windows_ntuser_dat" {
		t.Errorf("unexpected name: %s", ntuserMod.Name())
	}
	if ntuserMod.OutputRelPath() != "artifacts/windows/registry/users/" {
		t.Errorf("unexpected rel path: %s", ntuserMod.OutputRelPath())
	}
}
