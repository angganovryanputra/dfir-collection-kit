import { describe, expect, it } from "vitest";
import { evidenceItems } from "./evidence";

describe("evidenceItems", () => {
  it("uses the paginated Evidence API contract", () => {
    expect(evidenceItems({ items: [{ id: "artifact-1" }], total: 1 })).toEqual([{ id: "artifact-1" }]);
  });

  it("does not crash while a response is unavailable", () => {
    expect(evidenceItems(undefined)).toEqual([]);
  });
});
