package modules

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

// TestVSS_SafeCleanupOnFailure verifies that if VSS creation fails, vssMu is safely unlocked
// before returning, and the returned cleanup function is safe to invoke multiple times without panicking.
func TestVSS_SafeCleanupOnFailure(t *testing.T) {
	ctx := context.Background()
	mod := &BaseWindowsModule{}
	mod.SetPowerShellRunner(func(ctx context.Context, command string) (string, error) {
		return "", fmt.Errorf("simulated VSS provider error: Access Denied")
	})

	shadowID, devPath, cleanup, err := vssCreate(ctx, mod)
	if err == nil {
		t.Fatal("expected vssCreate to return error on runner failure")
	}
	if shadowID != "" || devPath != "" {
		t.Errorf("expected empty shadowID and devPath on error, got: %s, %s", shadowID, devPath)
	}

	// Verify vssMu was unlocked before returning
	if !vssMu.TryLock() {
		t.Fatal("vssMu was left locked after vssCreate error")
	}
	vssMu.Unlock()

	// Verify cleanup() is safe to call after failure and does not double-unlock or panic
	cleanup()
	cleanup()

	// Verify mutex is still healthy
	if !vssMu.TryLock() {
		t.Fatal("vssMu was broken after calling cleanup() on failure")
	}
	vssMu.Unlock()
}

// TestVSS_SafeCleanupOnSuccess verifies that on successful creation, vssMu is locked,
// calling cleanup() executes deletion and unlocks vssMu, and sync.Once guarantees
// deletion and unlock occur at most once.
func TestVSS_SafeCleanupOnSuccess(t *testing.T) {
	ctx := context.Background()
	mod := &BaseWindowsModule{}

	var delCalls int32
	validGUID := "{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}"
	validPath := `\\?\GLOBALROOT\Device\HarddiskVolumeShadowCopy42`

	mod.SetPowerShellRunner(func(ctx context.Context, command string) (string, error) {
		if strings.Contains(command, "Win32_ShadowCopy") && strings.Contains(command, "Create") {
			return fmt.Sprintf("%s|%s\n", validGUID, validPath), nil
		}
		if strings.Contains(command, ".Delete()") {
			atomic.AddInt32(&delCalls, 1)
			return "", nil
		}
		return "", fmt.Errorf("unexpected command: %s", command)
	})

	shadowID, devPath, cleanup, err := vssCreate(ctx, mod)
	if err != nil {
		t.Fatalf("vssCreate failed unexpectedly: %v", err)
	}
	if shadowID != validGUID {
		t.Errorf("expected shadowID %s, got %s", validGUID, shadowID)
	}
	if devPath != validPath {
		t.Errorf("expected devPath %s, got %s", validPath, devPath)
	}

	// Verify vssMu is locked while snapshot is active
	if vssMu.TryLock() {
		vssMu.Unlock()
		t.Fatal("expected vssMu to be locked while VSS snapshot is active")
	}

	// Execute cleanup()
	cleanup()

	// Verify deletion was executed
	if calls := atomic.LoadInt32(&delCalls); calls != 1 {
		t.Errorf("expected 1 deletion call, got %d", calls)
	}

	// Verify vssMu is now unlocked
	if !vssMu.TryLock() {
		t.Fatal("vssMu was not unlocked by cleanup()")
	}
	vssMu.Unlock()

	// Call cleanup() a second time — sync.Once must prevent re-execution and double-unlock
	cleanup()

	if calls := atomic.LoadInt32(&delCalls); calls != 1 {
		t.Errorf("expected deletion call count to remain 1 after repeated cleanup(), got %d", calls)
	}

	// Mutex must remain unlocked and valid
	if !vssMu.TryLock() {
		t.Fatal("vssMu should remain unlockable after repeated cleanup()")
	}
	vssMu.Unlock()
}

// TestVSS_SerializationConcurrent verifies that concurrent vssCreate calls are strictly serialized.
func TestVSS_SerializationConcurrent(t *testing.T) {
	ctx := context.Background()

	validGUID := "{B2C3D4E5-F6A7-8901-BCDE-FA2345678901}"
	validPath := `\\?\GLOBALROOT\Device\HarddiskVolumeShadowCopy99`

	var activeHolders int32
	var maxConcurrent int32
	var mu sync.Mutex

	recordConcurrency := func(delta int32) {
		mu.Lock()
		defer mu.Unlock()
		cur := atomic.AddInt32(&activeHolders, delta)
		if cur > maxConcurrent {
			maxConcurrent = cur
		}
	}

	makeMod := func() *BaseWindowsModule {
		m := &BaseWindowsModule{}
		m.SetPowerShellRunner(func(ctx context.Context, command string) (string, error) {
			if strings.Contains(command, "Create") {
				return fmt.Sprintf("%s|%s\n", validGUID, validPath), nil
			}
			return "", nil
		})
		return m
	}

	var wg sync.WaitGroup
	// Launch 3 goroutines trying to acquire VSS snapshots simultaneously
	for i := 0; i < 3; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			mod := makeMod()
			_, _, cleanup, err := vssCreate(ctx, mod)
			if err != nil {
				t.Errorf("vssCreate failed: %v", err)
				return
			}
			recordConcurrency(1)

			// Hold the lock briefly to simulate snapshot copying
			time.Sleep(20 * time.Millisecond)

			recordConcurrency(-1)
			cleanup()
		}()
	}

	wg.Wait()

	mu.Lock()
	highest := maxConcurrent
	mu.Unlock()

	if highest != 1 {
		t.Errorf("expected maximum concurrent VSS holders to be 1 (serialized), got %d", highest)
	}
}
