package parsers

import (
	"context"
	"encoding/binary"
	"encoding/csv"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/dfir/agent/internal/logging"
)

// LNKParser parses Windows Shell Link (.lnk) files into a single aggregated CSV.
type LNKParser struct{}

func (l *LNKParser) ID() string { return "lnk" }

func (l *LNKParser) Matches(absPath string) bool {
	return ext(absPath) == ".lnk"
}

func (l *LNKParser) ParseAll(ctx context.Context, files []string, parsedDir string) error {
	outDir := filepath.Join(parsedDir, "lnk")
	if err := ensureDir(outDir); err != nil {
		return err
	}
	outPath := filepath.Join(outDir, "lnk_files.csv")

	f, err := os.Create(outPath)
	if err != nil {
		return err
	}
	defer f.Close()

	cw := csv.NewWriter(f)
	cw.Write([]string{ //nolint:errcheck
		"LNKPath", "TargetPath", "TargetSize",
		"TargetCreated", "TargetModified", "TargetAccessed",
		"WorkingDir", "Arguments", "DriveType", "VolumeLabel",
	})

	ok := 0
	for _, lnkPath := range files {
		if ctx.Err() != nil {
			cw.Flush()
			return ctx.Err()
		}
		entry, err := parseLNKFile(lnkPath)
		if err != nil {
			logging.Warning("parsers/lnk: %s: %v", filepath.Base(lnkPath), err)
			continue
		}
		cw.Write([]string{ //nolint:errcheck
			lnkPath,
			entry.TargetPath,
			fmt.Sprintf("%d", entry.TargetSize),
			entry.TargetCreated,
			entry.TargetModified,
			entry.TargetAccessed,
			entry.WorkingDir,
			entry.Arguments,
			entry.DriveType,
			entry.VolumeLabel,
		})
		ok++
	}
	cw.Flush()
	if err := cw.Error(); err != nil {
		return err
	}
	logging.Info("parsers/lnk: %d/%d files parsed → %s", ok, len(files), outPath)
	return nil
}

// ── LNK binary format ─────────────────────────────────────────────────────────
//
// Shell Link Binary File Format (MS-SHLLINK)
// https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-shllink
//
// ShellLinkHeader (76 bytes / 0x4C):
//   0x00  uint32  HeaderSize  = 0x0000004C
//   0x04  [16]byte LinkCLSID
//   0x14  uint32  LinkFlags
//   0x18  uint32  FileAttributes
//   0x1C  FILETIME CreationTime   (target file)
//   0x24  FILETIME AccessTime     (target file)
//   0x2C  FILETIME WriteTime      (target file)
//   0x34  uint32  FileSize
//   0x38  int32   IconIndex
//   0x3C  uint32  ShowCommand
//   0x40  uint16  HotKey
//   0x42  [10]byte Reserved
//
// LinkFlags (bit positions):
//   Bit 0: HasLinkTargetIDList
//   Bit 1: HasLinkInfo
//   Bit 2: HasName
//   Bit 3: HasRelativePath
//   Bit 4: HasWorkingDir
//   Bit 5: HasArguments
//   Bit 6: HasIconLocation
//   Bit 7: IsUnicode (StringData uses Unicode CountedString)
//
// After header:
//   [IDList]    if HasLinkTargetIDList
//   [LinkInfo]  if HasLinkInfo
//   [StringData sections]

const (
	lnkFlagHasIDList      = 1 << 0
	lnkFlagHasLinkInfo    = 1 << 1
	lnkFlagHasName        = 1 << 2
	lnkFlagHasRelPath     = 1 << 3
	lnkFlagHasWorkingDir  = 1 << 4
	lnkFlagHasArguments   = 1 << 5
	lnkFlagHasIconLoc     = 1 << 6
	lnkFlagIsUnicode      = 1 << 7
)

// LinkInfo flags
const (
	liVolumeIDAndLocalBasePath   = 1 << 0
	liCommonNetworkRelativeLink  = 1 << 1
)

type lnkEntry struct {
	TargetPath     string
	TargetSize     uint32
	TargetCreated  string
	TargetModified string
	TargetAccessed string
	WorkingDir     string
	Arguments      string
	DriveType      string
	VolumeLabel    string
}

var driveTypes = [...]string{
	"Unknown", "NoRootDir", "Removable", "Fixed",
	"Remote", "CDROM", "RAMDisk",
}

func parseLNKFile(path string) (*lnkEntry, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read: %w", err)
	}
	if len(data) < 0x4C {
		return nil, fmt.Errorf("file too small (%d bytes)", len(data))
	}

	headerSize := binary.LittleEndian.Uint32(data[0:4])
	if headerSize != 0x4C {
		return nil, fmt.Errorf("unexpected header size: 0x%X", headerSize)
	}

	linkFlags := binary.LittleEndian.Uint32(data[0x14:0x18])
	isUnicode := linkFlags&lnkFlagIsUnicode != 0

	entry := &lnkEntry{
		TargetSize:     binary.LittleEndian.Uint32(data[0x34:0x38]),
		TargetCreated:  fileTimeToRFC3339(binary.LittleEndian.Uint64(data[0x1C:0x24])),
		TargetAccessed: fileTimeToRFC3339(binary.LittleEndian.Uint64(data[0x24:0x2C])),
		TargetModified: fileTimeToRFC3339(binary.LittleEndian.Uint64(data[0x2C:0x34])),
	}

	pos := 0x4C // start past header

	// Skip IDList if present
	if linkFlags&lnkFlagHasIDList != 0 {
		if pos+2 > len(data) {
			return entry, nil
		}
		idListSize := int(binary.LittleEndian.Uint16(data[pos : pos+2]))
		pos += 2 + idListSize
	}

	// Parse LinkInfo if present
	if linkFlags&lnkFlagHasLinkInfo != 0 {
		if pos+4 > len(data) {
			return entry, nil
		}
		liSize := int(binary.LittleEndian.Uint32(data[pos : pos+4]))
		if liSize >= 28 && pos+liSize <= len(data) {
			li := data[pos : pos+liSize]
			liFlags := binary.LittleEndian.Uint32(li[4:8])

			if liFlags&liVolumeIDAndLocalBasePath != 0 {
				// VolumeID offset at li[8]
				volOffset := int(binary.LittleEndian.Uint32(li[8:12]))
				if volOffset+16 <= len(li) {
					vol := li[volOffset:]
					if len(vol) >= 16 {
						driveTypeIdx := int(binary.LittleEndian.Uint32(vol[4:8]))
						if driveTypeIdx < len(driveTypes) {
							entry.DriveType = driveTypes[driveTypeIdx]
						}
						volLabelOffset := int(binary.LittleEndian.Uint32(vol[12:16]))
						if volLabelOffset < len(vol) {
							entry.VolumeLabel = nullTerminatedString(vol[volLabelOffset:])
						}
					}
				}
				// LocalBasePath offset at li[12]
				lbpOffset := int(binary.LittleEndian.Uint32(li[12:16]))
				if lbpOffset < len(li) {
					entry.TargetPath = nullTerminatedString(li[lbpOffset:])
				}
			}
		}
		pos += liSize
	}

	// Parse StringData sections
	readCountedString := func() string {
		if pos+2 > len(data) {
			return ""
		}
		count := int(binary.LittleEndian.Uint16(data[pos : pos+2]))
		pos += 2
		if isUnicode {
			byteLen := count * 2
			if pos+byteLen > len(data) {
				pos += byteLen
				return ""
			}
			s := decodeUTF16LE(data[pos : pos+byteLen])
			pos += byteLen
			return s
		}
		if pos+count > len(data) {
			pos += count
			return ""
		}
		s := string(data[pos : pos+count])
		pos += count
		return s
	}

	if linkFlags&lnkFlagHasName != 0 {
		readCountedString() // Description — skip
	}
	if linkFlags&lnkFlagHasRelPath != 0 {
		readCountedString() // RelativePath — skip
	}
	if linkFlags&lnkFlagHasWorkingDir != 0 {
		entry.WorkingDir = readCountedString()
	}
	if linkFlags&lnkFlagHasArguments != 0 {
		entry.Arguments = readCountedString()
	}

	return entry, nil
}

// nullTerminatedString extracts a null-terminated ASCII/ANSI string from a byte slice.
func nullTerminatedString(b []byte) string {
	end := strings.IndexByte(string(b), 0)
	if end < 0 {
		return string(b)
	}
	return string(b[:end])
}
