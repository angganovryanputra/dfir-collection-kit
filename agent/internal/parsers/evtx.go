//go:build windows

package parsers

import (
	"bufio"
	"context"
	"encoding/json"
	"encoding/xml"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/dfir/agent/internal/logging"
)

// EVTXParser parses Windows Event Log (.evtx) files into JSONL using wevtutil.
type EVTXParser struct{}

func (e *EVTXParser) ID() string { return "evtx" }

func (e *EVTXParser) Matches(absPath string) bool {
	return ext(absPath) == ".evtx"
}

func (e *EVTXParser) ParseAll(ctx context.Context, files []string, parsedDir string) error {
	outDir := filepath.Join(parsedDir, "evtx")
	if err := ensureDir(outDir); err != nil {
		return err
	}
	for _, f := range files {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		if err := parseEVTX(ctx, f, outDir); err != nil {
			logging.Warning("parsers/evtx: skipping %s: %v", filepath.Base(f), err)
		}
	}
	return nil
}

// parseEVTX runs wevtutil to export events as XML then converts to JSONL.
func parseEVTX(ctx context.Context, evtxPath, outDir string) error {
	baseName := strings.TrimSuffix(filepath.Base(evtxPath), filepath.Ext(evtxPath))
	outPath := filepath.Join(outDir, baseName+".jsonl")

	// wevtutil qe <file> /lf:true /f:xml /rd:true  — reads a log file from the beginning
	cmd := exec.CommandContext(ctx, "wevtutil.exe", "qe", evtxPath, "/lf:true", "/f:xml", "/rd:true")
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return fmt.Errorf("pipe: %w", err)
	}
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("wevtutil start: %w", err)
	}
	defer cmd.Wait() //nolint:errcheck

	outFile, err := os.Create(outPath)
	if err != nil {
		return fmt.Errorf("create output: %w", err)
	}
	defer outFile.Close()

	bw := bufio.NewWriterSize(outFile, 1<<20)
	count, err := streamEvtXML(stdout, bw, baseName)
	flushErr := bw.Flush()
	if flushErr != nil && err == nil {
		err = flushErr
	}
	if count == 0 {
		// Empty file — remove to avoid clutter
		outFile.Close()
		os.Remove(outPath)
		return err
	}
	logging.Info("parsers/evtx: %s — %d events → %s", filepath.Base(evtxPath), count, outPath)
	return err
}

// ── XML structs ─────────────────────────────────────────────────────────────

type evtProvider struct {
	Name string `xml:"Name,attr"`
}
type evtTimeCreated struct {
	SystemTime string `xml:"SystemTime,attr"`
}
type evtSystem struct {
	Provider      evtProvider    `xml:"Provider"`
	EventID       string         `xml:"EventID"`
	Level         string         `xml:"Level"`
	Task          string         `xml:"Task"`
	Keywords      string         `xml:"Keywords"`
	TimeCreated   evtTimeCreated `xml:"TimeCreated"`
	EventRecordID uint64         `xml:"EventRecordID"`
	Channel       string         `xml:"Channel"`
	Computer      string         `xml:"Computer"`
}
type evtDataItem struct {
	Name  string `xml:"Name,attr"`
	Value string `xml:",chardata"`
}
type evtEventData struct {
	Data []evtDataItem `xml:"Data"`
}
type evtXMLEvent struct {
	System    evtSystem    `xml:"System"`
	EventData evtEventData `xml:"EventData"`
}

// ── JSON output record ───────────────────────────────────────────────────────

type evtJSONRecord struct {
	Datetime      string            `json:"datetime"`
	EventID       string            `json:"event_id"`
	Channel       string            `json:"channel"`
	Computer      string            `json:"computer"`
	Provider      string            `json:"provider"`
	RecordID      uint64            `json:"record_id,omitempty"`
	Level         string            `json:"level,omitempty"`
	Source        string            `json:"source"`
	SourceShort   string            `json:"source_short"`
	Message       string            `json:"message"`
	Data          map[string]string `json:"data,omitempty"`
}

// streamEvtXML reads the wevtutil XML stream and writes one JSON object per event.
func streamEvtXML(r io.Reader, w io.Writer, channelHint string) (int, error) {
	dec := xml.NewDecoder(r)
	count := 0

	for {
		token, err := dec.Token()
		if err == io.EOF {
			break
		}
		if err != nil {
			// wevtutil may emit a partial stream on context cancellation — treat as done
			break
		}
		start, ok := token.(xml.StartElement)
		if !ok || start.Name.Local != "Event" {
			continue
		}

		var evt evtXMLEvent
		if err := dec.DecodeElement(&evt, &start); err != nil {
			continue
		}

		rec := evtXMLToJSON(evt, channelHint)
		b, merr := json.Marshal(rec)
		if merr != nil {
			continue
		}
		w.Write(b)       //nolint:errcheck
		w.Write([]byte{'\n'}) //nolint:errcheck
		count++
	}
	return count, nil
}

func evtXMLToJSON(evt evtXMLEvent, channelHint string) evtJSONRecord {
	ch := evt.System.Channel
	if ch == "" {
		ch = channelHint
	}

	dt := normaliseTimestamp(evt.System.TimeCreated.SystemTime)

	source, sourceShort := channelToSource(ch)
	msg := fmt.Sprintf("EventID %s (%s)", evt.System.EventID, ch)

	data := make(map[string]string, len(evt.EventData.Data))
	for _, d := range evt.EventData.Data {
		if d.Name != "" {
			data[d.Name] = strings.TrimSpace(d.Value)
		}
	}

	rec := evtJSONRecord{
		Datetime:    dt,
		EventID:     evt.System.EventID,
		Channel:     ch,
		Computer:    evt.System.Computer,
		Provider:    evt.System.Provider.Name,
		RecordID:    evt.System.EventRecordID,
		Level:       evt.System.Level,
		Source:      source,
		SourceShort: sourceShort,
		Message:     msg,
	}
	if len(data) > 0 {
		rec.Data = data
	}
	return rec
}

// normaliseTimestamp converts wevtutil SystemTime (ISO8601 with nanoseconds) to
// a clean RFC3339 UTC string. Returns the original string if parsing fails.
func normaliseTimestamp(s string) string {
	// wevtutil emits e.g. "2026-01-01T12:00:00.0000000Z"
	t, err := time.Parse("2006-01-02T15:04:05.0000000Z", s)
	if err != nil {
		t, err = time.Parse(time.RFC3339Nano, s)
	}
	if err != nil {
		return s
	}
	return t.UTC().Format(time.RFC3339)
}

func channelToSource(channel string) (source, sourceShort string) {
	c := strings.ToLower(channel)
	switch {
	case strings.Contains(c, "security"):
		return "Windows Security Event Log", "EVTX-SEC"
	case strings.Contains(c, "sysmon"):
		return "Sysmon Operational", "SYSMON"
	case strings.Contains(c, "powershell"):
		return "Windows PowerShell Event Log", "EVTX-PS"
	case strings.Contains(c, "defender"):
		return "Windows Defender Event Log", "EVTX-AV"
	case strings.Contains(c, "system"):
		return "Windows System Event Log", "EVTX-SYS"
	case strings.Contains(c, "application"):
		return "Windows Application Event Log", "EVTX-APP"
	case strings.Contains(c, "task"):
		return "Windows Task Scheduler Event Log", "EVTX-TASK"
	default:
		return "Windows Event Log", "EVTX"
	}
}
