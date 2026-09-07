import { describe, expect, it } from "vitest";
import { runtimeCoverageSummary } from "./assessment";

describe("runtimeCoverageSummary", () => {
  it("returns source only when no preview URL is configured", () => {
    expect(runtimeCoverageSummary({ runtimeBaseUrl: undefined })).toEqual({
      mode: "source_only",
      label: "Source only",
      pagesScanned: null,
      runtimeError: null,
    });
  });

  it("returns source + preview with page count when runtime ran", () => {
    expect(
      runtimeCoverageSummary(
        { runtimeBaseUrl: "https://app.example.com" },
        { ast: true, runtime: true, runtimePagesScanned: 3 },
      ),
    ).toEqual({
      mode: "source_and_preview",
      label: "Source + preview (3 pages)",
      pagesScanned: 3,
      runtimeError: null,
    });
  });

  it("surfaces last runtime error from assessment engines", () => {
    expect(
      runtimeCoverageSummary(
        { runtimeBaseUrl: "https://app.example.com" },
        { ast: true, runtime: false, runtimeError: "Connection refused" },
      ).runtimeError,
    ).toBe("Connection refused");
  });
});
