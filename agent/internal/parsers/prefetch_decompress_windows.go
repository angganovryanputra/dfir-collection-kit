//go:build windows

package parsers

import (
	"fmt"
	"unsafe"

	"golang.org/x/sys/windows"
)

// COMPRESSION_FORMAT_XPRESS_HUFF is the algorithm used by Windows 10 Prefetch (MAM format).
const compressionFormatXpressHuff = uint32(0x0104)

// decompressMAM decompresses a MAM-compressed Prefetch payload using ntdll.
// data is the compressed bytes (after the 8-byte MAM header).
// uncompressedSize is taken from the MAM header at bytes 4–8.
func decompressMAM(data []byte, uncompressedSize uint32) ([]byte, error) {
	if len(data) == 0 {
		return nil, fmt.Errorf("empty compressed data")
	}
	if uncompressedSize == 0 || uncompressedSize > 64*1024*1024 {
		return nil, fmt.Errorf("suspicious uncompressed size: %d", uncompressedSize)
	}

	ntdll := windows.NewLazySystemDLL("ntdll.dll")

	getWorkspaceSize := ntdll.NewProc("RtlGetCompressionWorkSpaceSize")
	rtlDecompress := ntdll.NewProc("RtlDecompressBufferEx")

	if err := getWorkspaceSize.Find(); err != nil {
		return nil, fmt.Errorf("RtlGetCompressionWorkSpaceSize not found: %w", err)
	}
	if err := rtlDecompress.Find(); err != nil {
		return nil, fmt.Errorf("RtlDecompressBufferEx not found: %w", err)
	}

	// Query workspace size
	var compressWorkSpaceSize, fragmentWorkSpaceSize uint32
	r1, _, _ := getWorkspaceSize.Call(
		uintptr(compressionFormatXpressHuff),
		uintptr(unsafe.Pointer(&compressWorkSpaceSize)),
		uintptr(unsafe.Pointer(&fragmentWorkSpaceSize)),
	)
	if r1 != 0 {
		return nil, fmt.Errorf("RtlGetCompressionWorkSpaceSize NTSTATUS=0x%X", r1)
	}

	workspace := make([]byte, compressWorkSpaceSize)
	output := make([]byte, uncompressedSize)
	var finalUncompressedSize uint32

	r1, _, _ = rtlDecompress.Call(
		uintptr(compressionFormatXpressHuff),
		uintptr(unsafe.Pointer(&output[0])),
		uintptr(uncompressedSize),
		uintptr(unsafe.Pointer(&data[0])),
		uintptr(uint32(len(data))),
		uintptr(unsafe.Pointer(&finalUncompressedSize)),
		uintptr(unsafe.Pointer(&workspace[0])),
	)
	if r1 != 0 {
		return nil, fmt.Errorf("RtlDecompressBufferEx NTSTATUS=0x%X", r1)
	}

	return output[:finalUncompressedSize], nil
}
