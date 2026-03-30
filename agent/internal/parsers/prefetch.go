package parsers

import (
	"context"
	"encoding/binary"
	"encoding/csv"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/dfir/agent/internal/logging"
)

// PrefetchParser parses Windows Prefetch (.pf) files into a single aggregated CSV.
type PrefetchParser struct{}

func (p *PrefetchParser) ID() string { return "prefetch" }

func (p *PrefetchParser) Matches(absPath string) bool {
	return ext(absPath) == ".pf"
}

func (p *PrefetchParser) ParseAll(ctx context.Context, files []string, parsedDir string) error {
	outDir := filepath.Join(parsedDir, "prefetch")
	if err := ensureDir(outDir); err != nil {
		return err
	}
	outPath := filepath.Join(outDir, "prefetch.csv")

	f, err := os.Create(outPath)
	if err != nil {
		return err
	}
	defer f.Close()

	cw := csv.NewWriter(f)
	cw.Write([]string{"ExeName", "PrefetchHash", "Version", "RunCount", "LastRunTime", "RunTimes", "FilePath"}) //nolint:errcheck

	ok := 0
	for _, pf := range files {
		if ctx.Err() != nil {
			cw.Flush()
			return ctx.Err()
		}
		entry, err := parsePFFile(pf)
		if err != nil {
			logging.Warning("parsers/prefetch: %s: %v", filepath.Base(pf), err)
			continue
		}
		cw.Write([]string{ //nolint:errcheck
			entry.ExeName,
			entry.PrefetchHash,
			fmt.Sprintf("%d", entry.Version),
			fmt.Sprintf("%d", entry.RunCount),
			entry.LastRunTime,
			strings.Join(entry.RunTimes, "|"),
			pf,
		})
		ok++
	}
	cw.Flush()
	if err := cw.Error(); err != nil {
		return err
	}
	logging.Info("parsers/prefetch: %d/%d files parsed → %s", ok, len(files), outPath)
	return nil
}

// ── Prefetch binary format ────────────────────────────────────────────────────
//
// Common header (all versions, post-decompression):
//   0x00  uint32  Version  (17=XP, 23=Vista/7, 26=Win8/8.1, 30=Win10+)
//   0x04  [4]byte Signature ("SCCA")
//   0x08  uint32  Unknown
//   0x0C  uint32  File size on disk
//   0x10  [60]byte Executable name (30 UTF-16LE chars, null-terminated)
//   0x4C  uint32  Prefetch hash
//
// Version-specific run-count / last-run offsets:
//   V17: LastRunTime=0x78  RunCount=0x90
//   V23: LastRunTime=0x80  RunCount=0x98
//   V26: LastRunTime=0x80  RunCount=0x98
//   V30: LastRunTimes[8]=0x80 (8×FILETIME)  RunCount=0xD0
//
// Win10 (V30) files may be MAM-compressed; decompression is OS-specific.
// See prefetch_decompress_windows.go for the Windows implementation.

type prefetchEntry struct {
	ExeName      string
	PrefetchHash string
	Version      uint32
	RunCount     uint32
	LastRunTime  string   // RFC3339 or ""
	RunTimes     []string // RFC3339 timestamps, V30 only
}

func parsePFFile(path string) (*prefetchEntry, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read: %w", err)
	}

	// Win10 MAM compression: first 4 bytes are "MAM\x84"
	if len(data) >= 8 && string(data[:3]) == "MAM" {
		uncompSize := binary.LittleEndian.Uint32(data[4:8])
		decompressed, derr := decompressMAM(data[8:], uncompSize)
		if derr != nil {
			return nil, fmt.Errorf("MAM decompress: %w", derr)
		}
		data = decompressed
	}

	if len(data) < 0xD4 {
		return nil, fmt.Errorf("file too small (%d bytes)", len(data))
	}

	// Validate signature
	if string(data[4:8]) != "SCCA" {
		return nil, fmt.Errorf("invalid signature: % x", data[4:8])
	}

	version := binary.LittleEndian.Uint32(data[0:4])

	// Executable name: UTF-16LE at offset 0x10, 60 bytes (30 chars)
	exeName := decodeUTF16LE(data[0x10:0x4C])

	// Prefetch hash: uint32 at offset 0x4C
	pfHash := fmt.Sprintf("%08X", binary.LittleEndian.Uint32(data[0x4C:0x50]))

	// Derive exe name from filename if header name is empty
	if exeName == "" {
		base := filepath.Base(path)
		if dash := strings.LastIndex(base, "-"); dash > 0 {
			exeName = base[:dash]
		} else {
			exeName = strings.TrimSuffix(base, ".pf")
		}
	}

	entry := &prefetchEntry{
		ExeName:      exeName,
		PrefetchHash: pfHash,
		Version:      version,
	}

	switch version {
	case 17:
		entry.RunCount = binary.LittleEndian.Uint32(data[0x90:0x94])
		entry.LastRunTime = fileTimeToRFC3339(binary.LittleEndian.Uint64(data[0x78:0x80]))
	case 23, 26:
		entry.RunCount = binary.LittleEndian.Uint32(data[0x98:0x9C])
		entry.LastRunTime = fileTimeToRFC3339(binary.LittleEndian.Uint64(data[0x80:0x88]))
	case 30:
		if len(data) < 0xD4 {
			return nil, fmt.Errorf("V30 data too short for run-count offset")
		}
		entry.RunCount = binary.LittleEndian.Uint32(data[0xD0:0xD4])
		// Up to 8 run times starting at 0x80
		for i := 0; i < 8; i++ {
			off := 0x80 + i*8
			if off+8 > len(data) {
				break
			}
			ft := binary.LittleEndian.Uint64(data[off : off+8])
			if ft == 0 {
				break
			}
			ts := fileTimeToRFC3339(ft)
			entry.RunTimes = append(entry.RunTimes, ts)
		}
		if len(entry.RunTimes) > 0 {
			entry.LastRunTime = entry.RunTimes[0]
		}
	default:
		return nil, fmt.Errorf("unsupported prefetch version %d", version)
	}

	return entry, nil
}

// decodeUTF16LE decodes a null-terminated UTF-16LE byte slice into a Go string.
func decodeUTF16LE(b []byte) string {
	if len(b)%2 != 0 {
		b = b[:len(b)-1]
	}
	runes := make([]rune, 0, len(b)/2)
	for i := 0; i+1 < len(b); i += 2 {
		r := rune(binary.LittleEndian.Uint16(b[i : i+2]))
		if r == 0 {
			break
		}
		runes = append(runes, r)
	}
	return string(runes)
}

// fileTimeToRFC3339 converts a Windows FILETIME (100-ns intervals since 1601-01-01) to RFC3339.
func fileTimeToRFC3339(ft uint64) string {
	if ft == 0 {
		return ""
	}
	// 116444736000000000 = number of 100-ns intervals between 1601-01-01 and 1970-01-01
	const epoch uint64 = 116444736000000000
	if ft < epoch {
		return ""
	}
	nsec := int64((ft - epoch) * 100)
	return time.Unix(0, nsec).UTC().Format(time.RFC3339)
}
