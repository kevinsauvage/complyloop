import { describe, expect, it } from "vitest";

import { authErrorCopy } from "./auth-error-copy";

describe("authErrorCopy", () => {
  it("returns specific copy for known error codes", () => {
    expect(authErrorCopy("AccessDenied")).toMatch(/denied GitHub access/);
    expect(authErrorCopy("Configuration")).toMatch(/misconfigured/);
  });

  it("falls back for unknown codes", () => {
    expect(authErrorCopy("SomethingElse")).toMatch(/failed/);
  });

  it("never resolves through the prototype chain", () => {
    // Crafted codes must render the fallback copy, not a function/object —
    // React cannot render those (500 on a public page).
    for (const code of [
      "constructor",
      "toString",
      "hasOwnProperty",
      "__proto__",
    ]) {
      const copy = authErrorCopy(code);
      expect(typeof copy).toBe("string");
      expect(copy).toMatch(/failed/);
    }
  });

  it("renders nothing for empty input", () => {
    expect(authErrorCopy(null)).toBeNull();
    expect(authErrorCopy("")).toBeNull();
  });
});
