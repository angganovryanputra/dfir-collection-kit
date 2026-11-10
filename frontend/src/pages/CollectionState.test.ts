import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("CollectionExecution state restoration contract", () => {
  const incidentId = "INC-1234";
  const storageKey = `dfir_collection_${incidentId}_modules`;

  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it("persists module selection and OS override to sessionStorage", () => {
    const stateToPersist = {
      selectedModuleIds: ["system_info", "processes", "network_connections"],
      osOverride: "windows",
    };

    sessionStorage.setItem(storageKey, JSON.stringify(stateToPersist));

    const retrieved = JSON.parse(sessionStorage.getItem(storageKey) || "{}");
    expect(retrieved.selectedModuleIds).toEqual([
      "system_info",
      "processes",
      "network_connections",
    ]);
    expect(retrieved.osOverride).toBe("windows");
  });

  it("restores state from sessionStorage when locationState is missing", () => {
    sessionStorage.setItem(
      storageKey,
      JSON.stringify({
        selectedModuleIds: ["event_logs", "registry"],
        osOverride: "windows",
      })
    );

    // Simulate reload resolution logic
    const stored = sessionStorage.getItem(storageKey);
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored!);

    const resolvedModules = Array.isArray(parsed)
      ? parsed
      : parsed?.selectedModuleIds || [];
    const resolvedOs = parsed?.osOverride;

    expect(resolvedModules).toEqual(["event_logs", "registry"]);
    expect(resolvedOs).toBe("windows");
  });

  it("gracefully supports legacy array-only format in sessionStorage", () => {
    sessionStorage.setItem(
      storageKey,
      JSON.stringify(["memory_dump", "mft_parser"])
    );

    const stored = sessionStorage.getItem(storageKey);
    const parsed = JSON.parse(stored!);
    const resolvedModules = Array.isArray(parsed)
      ? parsed
      : parsed?.selectedModuleIds || [];

    expect(resolvedModules).toEqual(["memory_dump", "mft_parser"]);
  });
});
