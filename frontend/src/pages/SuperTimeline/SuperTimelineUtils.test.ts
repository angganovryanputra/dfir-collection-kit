import { describe, it, expect } from "vitest";
import { formatTs, hashEvent } from "./SuperTimelineUtils";

describe("timeline evidence identity and time", () => {
    it("keeps distinct record IDs separate even if their display text is identical", () => {
        const row = { datetime: "2026-09-09T00:00:00Z", host: "WS-01", message: "logon" };
        expect(hashEvent({ ...row, event_uid: "record-1" })).not.toBe(hashEvent({ ...row, event_uid: "record-2" }));
    });
    it("normalizes equivalent timestamps to explicitly labelled UTC", () => {
        expect(formatTs("2026-09-09T07:00:00+07:00")).toBe(formatTs("2026-09-09T00:00:00Z"));
        expect(formatTs("2026-09-09 00:00:00")).toBe(formatTs("2026-09-09T00:00:00Z"));
        expect(formatTs("2026-09-09T00:00:00Z")).toContain("UTC");
    });
    it("handles absent or invalid dates", () => {
        expect(formatTs(null)).toBe("—");
        expect(formatTs("invalid")).toBe("—");
    });
});
