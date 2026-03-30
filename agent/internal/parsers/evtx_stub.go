//go:build !windows

package parsers

import "context"

// EVTXParser is a no-op on non-Windows platforms.
// EVTX parsing requires wevtutil.exe which is only available on Windows.
type EVTXParser struct{}

func (e *EVTXParser) ID() string { return "evtx" }

func (e *EVTXParser) Matches(absPath string) bool {
	return ext(absPath) == ".evtx"
}

func (e *EVTXParser) ParseAll(_ context.Context, _ []string, _ string) error {
	return nil
}
