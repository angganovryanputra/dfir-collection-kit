import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import AuditLog, {
  buildAuditExportParams,
  generateAuditCsv,
  AuditLogEntry,
} from "./AuditLog";
import * as apiModule from "@/lib/api";

const mockSampleEntries: AuditLogEntry[] = [
  {
    id: "entry-1",
    event_id: "evt-001",
    event_type: "INCIDENT_CREATED",
    actor_type: "user",
    actor_id: "admin-1",
    source: "web",
    action: "create",
    target_type: "incident",
    target_id: "inc-100",
    status: "success",
    message: "Created incident, severity high",
    metadata: null,
    created_at: "2026-11-10T10:00:00Z",
  },
  {
    id: "entry-2",
    event_id: "evt-002",
    event_type: "EVIDENCE_PURGED",
    actor_type: "system",
    actor_id: "system-cleanup",
    source: "cron",
    action: "purge",
    target_type: null,
    target_id: null,
    status: "warning",
    message: null,
    metadata: null,
    created_at: "2026-11-10T11:00:00Z",
  },
];

describe("AuditLog - Full Export Query Construction", () => {
  it("defaults limit to 10000 without filtering parameters", () => {
    const params = buildAuditExportParams({});
    expect(params.get("limit")).toBe("10000");
    expect(params.get("search")).toBeNull();
    expect(params.get("event_type")).toBeNull();
    expect(params.get("actor_id")).toBeNull();
    expect(params.get("start_time")).toBeNull();
    expect(params.get("end_time")).toBeNull();
  });

  it("sets search, target_id, event_type, and actor_id parameters", () => {
    const params = buildAuditExportParams({
      search: "inc-123",
      eventType: "COLLECTION_STARTED",
      actorId: "investigator-9",
    });
    expect(params.get("limit")).toBe("10000");
    expect(params.get("search")).toBe("inc-123");
    expect(params.get("target_id")).toBe("inc-123");
    expect(params.get("event_type")).toBe("COLLECTION_STARTED");
    expect(params.get("actor_id")).toBe("investigator-9");
  });

  it("converts dateFrom and dateTo into ISO start_time and end_time", () => {
    const params = buildAuditExportParams({
      dateFrom: "2026-11-01",
      dateTo: "2026-11-10",
    });
    expect(params.get("limit")).toBe("10000");
    expect(params.get("start_time")).toBe(new Date("2026-11-01").toISOString());
    expect(params.get("end_time")).toBe(new Date("2026-11-10T23:59:59").toISOString());
  });

  it("prioritizes explicit startTime and endTime if provided", () => {
    const explicitStart = "2026-11-05T08:00:00.000Z";
    const explicitEnd = "2026-11-05T18:00:00.000Z";
    const params = buildAuditExportParams({
      startTime: explicitStart,
      endTime: explicitEnd,
      dateFrom: "2026-11-01",
      dateTo: "2026-11-10",
    });
    expect(params.get("start_time")).toBe(explicitStart);
    expect(params.get("end_time")).toBe(explicitEnd);
  });
});

describe("AuditLog - CSV Generation", () => {
  it("emits expected CSV headers and maps all fields", () => {
    const csv = generateAuditCsv(mockSampleEntries);
    const lines = csv.split("\n");

    expect(lines[0]).toBe(
      "timestamp,event_type,actor_id,action,target_type,target_id,status,message"
    );
    expect(lines).toHaveLength(3);

    // Row 1: commas in message replaced by semicolons
    expect(lines[1]).toBe(
      "2026-11-10T10:00:00.000Z,INCIDENT_CREATED,admin-1,create,incident,inc-100,success,Created incident; severity high"
    );

    // Row 2: null target and null message safely represented as empty strings
    expect(lines[2]).toBe(
      "2026-11-10T11:00:00.000Z,EVIDENCE_PURGED,system-cleanup,purge,,,warning,"
    );
  });

  it("returns only header when entries list is empty", () => {
    const csv = generateAuditCsv([]);
    expect(csv).toBe(
      "timestamp,event_type,actor_id,action,target_type,target_id,status,message"
    );
  });
});

describe("AuditLog Component - Full Export Triggering", () => {
  let queryClient: QueryClient;
  let createObjectURLMock: ReturnType<typeof vi.fn>;
  let revokeObjectURLMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });

    createObjectURLMock = vi.fn((_obj?: Blob | MediaSource) => "blob:http://localhost/test-blob-uuid");
    revokeObjectURLMock = vi.fn((_url?: string) => {});
    window.URL.createObjectURL = createObjectURLMock as unknown as typeof window.URL.createObjectURL;
    window.URL.revokeObjectURL = revokeObjectURLMock as unknown as typeof window.URL.revokeObjectURL;
  });

  afterEach(() => {
    cleanup();
    queryClient.clear();
    vi.restoreAllMocks();
  });

  it("queries /audit-logs/?limit=10000 on export rather than the 50-row paginated view", async () => {
    const apiGetSpy = vi.spyOn(apiModule, "apiGet").mockImplementation(async (path: string) => {
      if (path.startsWith("/audit-logs")) {
        if (path.includes("limit=10000")) {
          return {
            entries: mockSampleEntries,
            total: 2,
          };
        }
        return {
          entries: [mockSampleEntries[0]],
          total: 150,
        };
      }
      if (path.startsWith("/incidents")) {
        return { total: 0, items: [] };
      }
      if (path.startsWith("/collectors")) {
        return [];
      }
      if (path.startsWith("/users/me")) {
        return { username: "admin", role: "admin" };
      }
      return {};
    });

    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <AuditLog />
        </MemoryRouter>
      </QueryClientProvider>
    );

    // Verify initial paginated load executed
    await waitFor(() => {
      expect(screen.getByText("INCIDENT_CREATED")).toBeInTheDocument();
    });

    const exportBtn = screen.getByRole("button", { name: /export csv/i });
    expect(exportBtn).not.toBeDisabled();

    fireEvent.click(exportBtn);

    await waitFor(() => {
      expect(apiGetSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\/audit-logs\/\?limit=10000/)
      );
    });

    await waitFor(() => {
      expect(createObjectURLMock).toHaveBeenCalledTimes(1);
      expect(clickSpy).toHaveBeenCalledTimes(1);
      expect(revokeObjectURLMock).toHaveBeenCalledTimes(1);
    });
  });

  it("handles export errors gracefully without unhandled crashes", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(apiModule, "apiGet").mockImplementation(async (path: string) => {
      if (path.startsWith("/audit-logs")) {
        if (path.includes("limit=10000")) {
          throw new Error("Export network failure");
        }
        return {
          entries: [mockSampleEntries[0]],
          total: 1,
        };
      }
      if (path.startsWith("/incidents")) {
        return { total: 0, items: [] };
      }
      if (path.startsWith("/collectors")) {
        return [];
      }
      if (path.startsWith("/users/me")) {
        return { username: "admin", role: "admin" };
      }
      return {};
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <AuditLog />
        </MemoryRouter>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("INCIDENT_CREATED")).toBeInTheDocument();
    });

    const exportBtn = screen.getByRole("button", { name: /export csv/i });
    fireEvent.click(exportBtn);

    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Failed to export audit logs:",
        expect.any(Error)
      );
    });

    // Button should be reset back to "EXPORT CSV"
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /export csv/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /export csv/i })).not.toBeDisabled();
    });
  });
});
