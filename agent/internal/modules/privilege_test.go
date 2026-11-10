package modules

import (
	"testing"
	"time"
)

func TestIsAdmin(t *testing.T) {
	start := time.Now()
	admin := IsAdmin()
	elapsed := time.Since(start)

	t.Logf("IsAdmin returned: %v (took %v)", admin, elapsed)

	// Verify execution time is sub-millisecond (< 50ms threshold, vs powershell 500-1500ms)
	if elapsed > 50*time.Millisecond {
		t.Errorf("IsAdmin took too long: %v (expected < 50ms)", elapsed)
	}
}

func TestIsAdminMultipleCalls(t *testing.T) {
	for i := 0; i < 10; i++ {
		start := time.Now()
		_ = IsAdmin()
		elapsed := time.Since(start)
		if elapsed > 50*time.Millisecond {
			t.Fatalf("call %d took %v, exceeding 50ms", i, elapsed)
		}
	}
}

func BenchmarkIsAdmin(b *testing.B) {
	for i := 0; i < b.N; i++ {
		_ = IsAdmin()
	}
}
