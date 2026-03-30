//go:build !windows

package parsers

import "fmt"

// decompressMAM is unsupported on non-Windows platforms.
// The caller falls back to skipping v30 compressed prefetch files.
func decompressMAM(_ []byte, _ uint32) ([]byte, error) {
	return nil, fmt.Errorf("MAM decompression requires Windows (ntdll.dll)")
}
