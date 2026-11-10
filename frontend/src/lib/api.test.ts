import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  apiDelete,
  apiGet,
  apiPatch,
  apiPost,
  apiPut,
  HttpMethod,
  normalizeMutatingPath,
} from "./api";

describe("normalizeMutatingPath", () => {
  it("leaves GET requests untouched", () => {
    expect(normalizeMutatingPath("/incidents", "GET")).toBe("/incidents");
    expect(normalizeMutatingPath("/incidents?type=MALWARE", "GET")).toBe("/incidents?type=MALWARE");
    expect(normalizeMutatingPath("/devices", "GET")).toBe("/devices");
    expect(normalizeMutatingPath("/collectors", "GET")).toBe("/collectors");
    expect(normalizeMutatingPath("/settings", "GET")).toBe("/settings");
    expect(normalizeMutatingPath("/templates", "GET")).toBe("/templates");
    expect(normalizeMutatingPath("/users", "GET")).toBe("/users");
    expect(normalizeMutatingPath("/audit-logs", "GET")).toBe("/audit-logs");
  });

  it("appends trailing slashes to mutating collection root paths", () => {
    const mutatingMethods: HttpMethod[] = ["POST", "PUT", "PATCH", "DELETE"];

    for (const method of mutatingMethods) {
      expect(normalizeMutatingPath("/incidents", method)).toBe("/incidents/");
      expect(normalizeMutatingPath("/devices", method)).toBe("/devices/");
      expect(normalizeMutatingPath("/collectors", method)).toBe("/collectors/");
      expect(normalizeMutatingPath("/settings", method)).toBe("/settings/");
      expect(normalizeMutatingPath("/templates", method)).toBe("/templates/");
      expect(normalizeMutatingPath("/users", method)).toBe("/users/");
      expect(normalizeMutatingPath("/audit-logs", method)).toBe("/audit-logs/");
    }
  });

  it("preserves existing trailing slashes", () => {
    expect(normalizeMutatingPath("/incidents/", "POST")).toBe("/incidents/");
    expect(normalizeMutatingPath("/devices/", "POST")).toBe("/devices/");
    expect(normalizeMutatingPath("/collectors/", "POST")).toBe("/collectors/");
    expect(normalizeMutatingPath("/settings/", "PUT")).toBe("/settings/");
    expect(normalizeMutatingPath("/templates/", "POST")).toBe("/templates/");
    expect(normalizeMutatingPath("/users/", "POST")).toBe("/users/");
    expect(normalizeMutatingPath("/audit-logs/", "POST")).toBe("/audit-logs/");
  });

  it("preserves query parameters and hashes while appending trailing slashes", () => {
    expect(normalizeMutatingPath("/incidents?type=MALWARE", "POST")).toBe("/incidents/?type=MALWARE");
    expect(normalizeMutatingPath("/settings?reload=true", "PUT")).toBe("/settings/?reload=true");
    expect(normalizeMutatingPath("/devices?status=online#active", "PATCH")).toBe("/devices/?status=online#active");
    // Idempotent when trailing slash is already present before query
    expect(normalizeMutatingPath("/incidents/?type=MALWARE", "POST")).toBe("/incidents/?type=MALWARE");
  });

  it("does not modify sub-resource or parameterized paths", () => {
    expect(normalizeMutatingPath("/incidents/INC-123/collect", "POST")).toBe("/incidents/INC-123/collect");
    expect(normalizeMutatingPath("/users/U-1", "DELETE")).toBe("/users/U-1");
    expect(normalizeMutatingPath("/users/U-1", "PATCH")).toBe("/users/U-1");
    expect(normalizeMutatingPath("/templates/tmpl-999/use", "POST")).toBe("/templates/tmpl-999/use");
    expect(normalizeMutatingPath("/platform/custom-modules", "POST")).toBe("/platform/custom-modules");
    expect(normalizeMutatingPath("/ai/oauth/google/exchange", "POST")).toBe("/ai/oauth/google/exchange");
    expect(normalizeMutatingPath("/processing/incident/INC-1/trigger", "POST")).toBe("/processing/incident/INC-1/trigger");
  });
});

describe("api client safeguard", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
      headers: new Headers(),
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("automatically normalizes mutating collection root requests with trailing slashes", async () => {
    await apiPost("/incidents", { title: "Test Incident" });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/v1/incidents/",
      expect.objectContaining({ method: "POST" }),
    );

    await apiPut("/settings", { key: "val" });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/v1/settings/",
      expect.objectContaining({ method: "PUT" }),
    );

    await apiPatch("/devices", { status: "online" });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/v1/devices/",
      expect.objectContaining({ method: "PATCH" }),
    );

    await apiDelete("/users");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/v1/users/",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("does not append trailing slashes to GET requests", async () => {
    await apiGet("/incidents");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/v1/incidents",
      expect.objectContaining({ method: "GET" }),
    );
  });
});
