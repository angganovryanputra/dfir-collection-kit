package parsers

import (
	"context"
	"os"
	"path/filepath"
	"strings"

	"github.com/dfir/agent/internal/logging"
)

// ArtifactParser parses collected artifacts into structured CSV or JSONL output.
type ArtifactParser interface {
	// ID returns the unique parser identifier for logging.
	ID() string
	// Matches returns true when this parser should handle the given absolute file path.
	Matches(absPath string) bool
	// ParseAll receives all matched files and writes parsed output under parsedDir.
	// Errors are best-effort; partial output is acceptable.
	ParseAll(ctx context.Context, files []string, parsedDir string) error
}

var registry []ArtifactParser

// Register adds a parser to the registry.
func Register(p ArtifactParser) {
	registry = append(registry, p)
}

// Init registers all built-in parsers. Call once before RunAll.
func Init() {
	Register(&EVTXParser{})
	Register(&BrowserHistoryParser{})
	Register(&PrefetchParser{})
	Register(&LNKParser{})
}

// RunAll walks workDir, matches files to registered parsers, and runs each parser.
// Execution is best-effort: individual parser errors are logged and skipped.
func RunAll(ctx context.Context, workDir string) {
	parsedDir := filepath.Join(workDir, "parsed")
	if err := os.MkdirAll(parsedDir, 0755); err != nil {
		logging.Error("parsers: cannot create parsed dir: %v", err)
		return
	}

	// Walk workDir and bucket files per parser
	matched := make(map[string][]string, len(registry))
	_ = filepath.Walk(workDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}
		if info.IsDir() {
			// Skip the output dir and the parsed dir itself
			if path == parsedDir || strings.HasSuffix(filepath.ToSlash(path), "/parsed") {
				return filepath.SkipDir
			}
			return nil
		}
		if info.Name() == "collection.zip" || info.Name() == "error.txt" {
			return nil
		}
		for _, p := range registry {
			if p.Matches(path) {
				matched[p.ID()] = append(matched[p.ID()], path)
			}
		}
		return nil
	})

	for _, p := range registry {
		files := matched[p.ID()]
		if len(files) == 0 {
			continue
		}
		select {
		case <-ctx.Done():
			return
		default:
		}
		logging.Info("parsers: %s — processing %d file(s)", p.ID(), len(files))
		if err := p.ParseAll(ctx, files, parsedDir); err != nil {
			logging.Warning("parsers: %s failed: %v", p.ID(), err)
		}
	}
}

// helpers shared across parsers

func ext(path string) string {
	return strings.ToLower(filepath.Ext(path))
}

func ensureDir(path string) error {
	return os.MkdirAll(path, 0755)
}
