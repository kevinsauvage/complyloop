import { describe, expect, it } from "vitest";

import { normalizeRoutes } from "./routes";

describe("normalizeRoutes", () => {
  it("trims, drops empties, and prefixes bare paths", () => {
    expect(normalizeRoutes([" /x ", "", "a"])).toEqual(["/x", "/a"]);
  });

  it("keeps explicit roots and returns empty for blank input", () => {
    expect(normalizeRoutes(["/"])).toEqual(["/"]);
    expect(normalizeRoutes([])).toEqual([]);
    expect(normalizeRoutes(["  ", "\n"])).toEqual([]);
  });

  it("passes absolute URLs through for the scan-time SSRF gate", () => {
    expect(normalizeRoutes(["http://127.0.0.1/admin"])).toEqual([
      "http://127.0.0.1/admin",
    ]);
  });
});
