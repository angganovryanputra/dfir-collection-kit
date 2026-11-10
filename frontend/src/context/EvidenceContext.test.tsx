import { act, renderHook } from "@testing-library/react";
import React, { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EvidenceProvider, useEvidence } from "./EvidenceContext";

describe("EvidenceContext incident scoping", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal("confirm", vi.fn(() => true));
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("stores and retrieves pinned items under global key when no incident is active", () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <EvidenceProvider>{children}</EvidenceProvider>
    );

    const { result } = renderHook(() => useEvidence(), { wrapper });

    expect(result.current.pinnedItems).toEqual([]);

    act(() => {
      result.current.pinItem({
        id: "ev-1",
        type: "event",
        title: "Test Event",
        content: "Log payload",
        timestamp: "2026-11-10T12:00:00Z",
        metadata: { source: "syslog" },
      });
    });

    expect(result.current.pinnedItems).toHaveLength(1);
    expect(result.current.pinnedItems[0].id).toBe("ev-1");

    const globalStorage = localStorage.getItem("dfir_pinned_evidence_global");
    expect(globalStorage).not.toBeNull();
    const parsed = JSON.parse(globalStorage!);
    expect(parsed[0].id).toBe("ev-1");
  });

  it("scopes storage to incident ID provided explicitly", () => {
    const incidentId = "INC-TEST-001";
    const wrapper = ({ children }: { children: ReactNode }) => (
      <EvidenceProvider incidentId={incidentId}>{children}</EvidenceProvider>
    );

    const { result } = renderHook(() => useEvidence(), { wrapper });

    act(() => {
      result.current.pinItem({
        id: "ev-inc1",
        type: "hit",
        title: "Sigma Match",
        content: "Rule hit",
        timestamp: "2026-11-10T12:00:00Z",
        metadata: { severity: "high" },
      });
    });

    expect(result.current.activeIncidentId).toBe(incidentId);
    expect(result.current.pinnedItems[0].incidentId).toBe(incidentId);

    // Stored under incident-specific key
    const incidentStorage = localStorage.getItem(`dfir_pinned_evidence_${incidentId}`);
    expect(incidentStorage).not.toBeNull();
    expect(JSON.parse(incidentStorage!)[0].id).toBe("ev-inc1");

    // Global storage must not contain this item
    expect(localStorage.getItem("dfir_pinned_evidence_global")).toBeNull();
  });

  it("detects incident ID from window.location.pathname", () => {
    window.history.pushState({}, "", "/incidents/INC-FROM-ROUTE-42/timeline");

    const wrapper = ({ children }: { children: ReactNode }) => (
      <EvidenceProvider>{children}</EvidenceProvider>
    );

    const { result } = renderHook(() => useEvidence(), { wrapper });

    expect(result.current.activeIncidentId).toBe("INC-FROM-ROUTE-42");

    act(() => {
      result.current.pinItem({
        id: "ev-route",
        type: "match",
        title: "YARA match",
        content: "Rule matched",
        timestamp: "2026-11-10T12:00:00Z",
        metadata: {},
      });
    });

    const routeStorage = localStorage.getItem("dfir_pinned_evidence_INC-FROM-ROUTE-42");
    expect(routeStorage).not.toBeNull();
    expect(JSON.parse(routeStorage!)[0].id).toBe("ev-route");
  });

  it("prevents cross-pollination between two different incident workspaces", () => {
    // Seed storage for INC-A
    localStorage.setItem(
      "dfir_pinned_evidence_INC-A",
      JSON.stringify([
        {
          id: "item-a",
          type: "event",
          title: "A Event",
          content: "A content",
          timestamp: "2026-11-10T00:00:00Z",
          metadata: {},
          pinnedAt: "2026-11-10T00:00:00Z",
          incidentId: "INC-A",
        },
      ])
    );

    // Seed storage for INC-B
    localStorage.setItem(
      "dfir_pinned_evidence_INC-B",
      JSON.stringify([
        {
          id: "item-b",
          type: "event",
          title: "B Event",
          content: "B content",
          timestamp: "2026-11-10T00:00:00Z",
          metadata: {},
          pinnedAt: "2026-11-10T00:00:00Z",
          incidentId: "INC-B",
        },
      ])
    );

    const { result: resultA } = renderHook(() => useEvidence(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <EvidenceProvider incidentId="INC-A">{children}</EvidenceProvider>
      ),
    });

    expect(resultA.current.pinnedItems).toHaveLength(1);
    expect(resultA.current.pinnedItems[0].id).toBe("item-a");

    const { result: resultB } = renderHook(() => useEvidence(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <EvidenceProvider incidentId="INC-B">{children}</EvidenceProvider>
      ),
    });

    expect(resultB.current.pinnedItems).toHaveLength(1);
    expect(resultB.current.pinnedItems[0].id).toBe("item-b");
  });
});
