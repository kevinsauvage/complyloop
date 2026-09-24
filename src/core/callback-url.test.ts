import { describe, expect, it } from "vitest";

import { safeCallbackUrl } from "./callback-url";

describe("safeCallbackUrl", () => {
  it("passes internal paths through", () => {
    expect(safeCallbackUrl("/dashboard/findings")).toBe("/dashboard/findings");
    expect(safeCallbackUrl("/")).toBe("/");
  });

  it("rejects protocol-relative and backslash open redirects", () => {
    expect(safeCallbackUrl("//evil.com")).toBe("/dashboard");
    expect(safeCallbackUrl("/\\evil.com")).toBe("/dashboard");
  });

  it("rejects non-absolute and non-string values", () => {
    expect(safeCallbackUrl("https://evil.com")).toBe("/dashboard");
    expect(safeCallbackUrl("dashboard")).toBe("/dashboard");
    expect(safeCallbackUrl(undefined)).toBe("/dashboard");
  });
});
