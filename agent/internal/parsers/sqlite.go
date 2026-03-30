package parsers

import (
	"context"
	"database/sql"
	"encoding/csv"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/dfir/agent/internal/logging"
	_ "modernc.org/sqlite" // pure-Go SQLite driver
)

// BrowserHistoryParser extracts browser history from Chrome, Edge, and Firefox SQLite databases.
type BrowserHistoryParser struct{}

func (b *BrowserHistoryParser) ID() string { return "browser" }

func (b *BrowserHistoryParser) Matches(absPath string) bool {
	base := filepath.Base(absPath)
	path := filepath.ToSlash(absPath)
	// Chrome / Edge: file named "History" inside browser/<name>/ collection dir
	if base == "History" && strings.Contains(path, "/browser/") {
		return true
	}
	// Firefox: places.sqlite
	if base == "places.sqlite" && strings.Contains(path, "/browser/") {
		return true
	}
	return false
}

func (b *BrowserHistoryParser) ParseAll(ctx context.Context, files []string, parsedDir string) error {
	outDir := filepath.Join(parsedDir, "browser")
	if err := ensureDir(outDir); err != nil {
		return err
	}
	for _, f := range files {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		if err := parseBrowserDB(ctx, f, outDir); err != nil {
			logging.Warning("parsers/browser: skipping %s: %v", f, err)
		}
	}
	return nil
}

// parseBrowserDB detects the browser type and queries the history.
func parseBrowserDB(ctx context.Context, dbPath, outDir string) error {
	// Derive a safe output filename from the path
	// e.g. artifacts/windows/browser/chrome/Default/History → chrome_Default_history.csv
	parts := strings.Split(filepath.ToSlash(dbPath), "/")
	outName := sanitiseBrowserOutName(parts) + ".csv"
	outPath := filepath.Join(outDir, outName)

	// Open as read-only (URI mode prevents any write to the source DB)
	uri := fmt.Sprintf("file:%s?mode=ro&immutable=1", dbPath)
	db, err := sql.Open("sqlite", uri)
	if err != nil {
		return fmt.Errorf("open: %w", err)
	}
	defer db.Close()

	db.SetMaxOpenConns(1)

	// Detect DB type by checking table presence
	if tableExists(ctx, db, "urls") {
		return parseChromiumHistory(ctx, db, outPath, dbPath)
	}
	if tableExists(ctx, db, "moz_places") {
		return parseFirefoxHistory(ctx, db, outPath, dbPath)
	}
	return fmt.Errorf("unrecognised browser DB schema in %s", filepath.Base(dbPath))
}

// ── Chromium (Chrome / Edge) ─────────────────────────────────────────────────

func parseChromiumHistory(ctx context.Context, db *sql.DB, outPath, srcPath string) error {
	const q = `
		SELECT u.url, u.title, u.visit_count, u.last_visit_time,
		       v.visit_time, v.from_visit
		FROM   urls u
		JOIN   visits v ON v.url = u.id
		ORDER  BY v.visit_time DESC
		LIMIT  50000`

	rows, err := db.QueryContext(ctx, q)
	if err != nil {
		// visits table may not exist in older schemas; fall back to urls-only
		return parseChromiumURLsOnly(ctx, db, outPath, srcPath)
	}
	defer rows.Close()

	f, err := os.Create(outPath)
	if err != nil {
		return err
	}
	defer f.Close()

	cw := csv.NewWriter(f)
	cw.Write([]string{"Browser", "URL", "Title", "VisitCount", "LastVisitTime", "VisitTime"}) //nolint:errcheck

	browser := guessBrowser(srcPath)
	n := 0
	for rows.Next() {
		var url, title string
		var visitCount int
		var lastVisitTime, visitTime int64
		var fromVisit sql.NullInt64
		if err := rows.Scan(&url, &title, &visitCount, &lastVisitTime, &visitTime, &fromVisit); err != nil {
			continue
		}
		cw.Write([]string{ //nolint:errcheck
			browser, url, title,
			fmt.Sprintf("%d", visitCount),
			chromeTimeToRFC3339(lastVisitTime),
			chromeTimeToRFC3339(visitTime),
		})
		n++
	}
	cw.Flush()
	if err := cw.Error(); err != nil {
		return err
	}
	logging.Info("parsers/browser: %s — %d visit rows → %s", filepath.Base(srcPath), n, outPath)
	return rows.Err()
}

func parseChromiumURLsOnly(ctx context.Context, db *sql.DB, outPath, srcPath string) error {
	const q = `SELECT url, title, visit_count, last_visit_time FROM urls ORDER BY last_visit_time DESC LIMIT 50000`
	rows, err := db.QueryContext(ctx, q)
	if err != nil {
		return fmt.Errorf("query urls: %w", err)
	}
	defer rows.Close()

	f, err := os.Create(outPath)
	if err != nil {
		return err
	}
	defer f.Close()

	cw := csv.NewWriter(f)
	cw.Write([]string{"Browser", "URL", "Title", "VisitCount", "LastVisitTime"}) //nolint:errcheck

	browser := guessBrowser(srcPath)
	n := 0
	for rows.Next() {
		var url, title string
		var visitCount int
		var lastVisitTime int64
		if err := rows.Scan(&url, &title, &visitCount, &lastVisitTime); err != nil {
			continue
		}
		cw.Write([]string{browser, url, title, fmt.Sprintf("%d", visitCount), chromeTimeToRFC3339(lastVisitTime)}) //nolint:errcheck
		n++
	}
	cw.Flush()
	logging.Info("parsers/browser: %s (urls-only) — %d rows → %s", filepath.Base(srcPath), n, outPath)
	return rows.Err()
}

// ── Firefox ──────────────────────────────────────────────────────────────────

func parseFirefoxHistory(ctx context.Context, db *sql.DB, outPath, srcPath string) error {
	const q = `
		SELECT p.url, p.title, p.visit_count, p.last_visit_date,
		       h.visit_date, h.visit_type
		FROM   moz_places p
		JOIN   moz_historyvisits h ON h.place_id = p.id
		ORDER  BY h.visit_date DESC
		LIMIT  50000`

	rows, err := db.QueryContext(ctx, q)
	if err != nil {
		return fmt.Errorf("query moz_historyvisits: %w", err)
	}
	defer rows.Close()

	f, err := os.Create(outPath)
	if err != nil {
		return err
	}
	defer f.Close()

	cw := csv.NewWriter(f)
	cw.Write([]string{"Browser", "URL", "Title", "VisitCount", "LastVisitTime", "VisitTime", "VisitType"}) //nolint:errcheck

	n := 0
	for rows.Next() {
		var url string
		var title sql.NullString
		var visitCount int
		var lastVisitDate, visitDate sql.NullInt64
		var visitType int
		if err := rows.Scan(&url, &title, &visitCount, &lastVisitDate, &visitDate, &visitType); err != nil {
			continue
		}
		cw.Write([]string{ //nolint:errcheck
			"Firefox", url, title.String,
			fmt.Sprintf("%d", visitCount),
			firefoxTimeToRFC3339(lastVisitDate.Int64),
			firefoxTimeToRFC3339(visitDate.Int64),
			fmt.Sprintf("%d", visitType),
		})
		n++
	}
	cw.Flush()
	logging.Info("parsers/browser: firefox — %d visit rows → %s", n, outPath)
	return rows.Err()
}

// ── helpers ───────────────────────────────────────────────────────────────────

func tableExists(ctx context.Context, db *sql.DB, table string) bool {
	var name string
	err := db.QueryRowContext(ctx,
		"SELECT name FROM sqlite_master WHERE type='table' AND name=?", table).Scan(&name)
	return err == nil
}

func guessBrowser(path string) string {
	p := strings.ToLower(filepath.ToSlash(path))
	switch {
	case strings.Contains(p, "/edge/"):
		return "Edge"
	case strings.Contains(p, "/chrome/"):
		return "Chrome"
	default:
		return "Chromium"
	}
}

// chromeTimeToRFC3339 converts Chrome/Edge timestamp (microseconds since 1601-01-01) to RFC3339.
func chromeTimeToRFC3339(t int64) string {
	if t <= 0 {
		return ""
	}
	// Microseconds between 1601-01-01 and 1970-01-01
	const epoch = int64(11644473600000000)
	usec := t - epoch
	if usec <= 0 {
		return ""
	}
	return time.Unix(usec/1e6, (usec%1e6)*1000).UTC().Format(time.RFC3339)
}

// firefoxTimeToRFC3339 converts Firefox timestamp (microseconds since Unix epoch) to RFC3339.
func firefoxTimeToRFC3339(t int64) string {
	if t <= 0 {
		return ""
	}
	return time.Unix(t/1e6, (t%1e6)*1000).UTC().Format(time.RFC3339)
}

func sanitiseBrowserOutName(parts []string) string {
	// Find "browser" in path, use next two segments as name
	for i, p := range parts {
		if p == "browser" && i+2 < len(parts) {
			name := parts[i+1] + "_" + parts[i+2]
			// Strip extension from last part
			if dot := strings.LastIndex(name, "."); dot > 0 {
				name = name[:dot]
			}
			return strings.ToLower(name)
		}
	}
	return "browser_history"
}
