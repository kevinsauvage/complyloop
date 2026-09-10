import { describe, expect, it } from "vitest";
import { parseRoutes } from "./runtime-routes";

describe("parseRoutes", () => {
  it("returns [] for missing or blank input (scan defaults to /)", () => {
    expect(parseRoutes(undefined)).toEqual([]);
    expect(parseRoutes("")).toEqual([]);
    expect(parseRoutes("   ")).toEqual([]);
  });

  it("splits on newlines and commas and prefixes bare paths", () => {
    expect(parseRoutes("a,b")).toEqual(["/a", "/b"]);
    expect(parseRoutes(" /x ")).toEqual(["/x"]);
    expect(parseRoutes("home, /about\ncontact")).toEqual([
      "/home",
      "/about",
      "/contact",
    ]);
  });

  it("rejects absolute http(s) routes", () => {
    expect(() => parseRoutes("/ok\nhttp://127.0.0.1/admin")).toThrow(
      /must be paths under the Preview/,
    );
  });
});
