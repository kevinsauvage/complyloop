import { describe, expect, it, vi } from "vitest";

vi.mock("playwright-core", () => ({
  chromium: {
    executablePath: vi.fn(() => {
      throw new Error("browser unavailable");
    }),
  },
}));

import { chromiumExecutableAvailable } from "./playwright-page";

describe("chromiumExecutableAvailable", () => {
  it("returns false when Playwright cannot resolve an executable", () => {
    expect(chromiumExecutableAvailable()).toBe(false);
  });
});
