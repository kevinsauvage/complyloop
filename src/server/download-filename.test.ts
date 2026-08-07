import { describe, expect, it } from "vitest";
import { sanitizeDownloadFilename } from "./download-filename";

describe("sanitizeDownloadFilename", () => {
  it("strips quotes and path characters", () => {
    expect(sanitizeDownloadFilename('Acme "../shop"')).toBe("Acme-shop");
    expect(sanitizeDownloadFilename("a/b\\c.md")).toBe("a-b-c.md");
  });

  it("falls back when empty", () => {
    expect(sanitizeDownloadFilename("!!!")).toBe("download");
  });
});
