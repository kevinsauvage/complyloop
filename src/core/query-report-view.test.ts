import { describe, expect, it } from "vitest";
import { parseReportViewParam, reportHref } from "./query";

describe("parseReportViewParam", () => {
  it("accepts the engineering view", () => {
    expect(parseReportViewParam("engineering")).toBe("engineering");
  });

  it("defaults everything else to audit", () => {
    expect(parseReportViewParam(undefined)).toBe("audit");
    expect(parseReportViewParam(null)).toBe("audit");
    expect(parseReportViewParam("audit")).toBe("audit");
    expect(parseReportViewParam("bogus")).toBe("audit");
  });
});

describe("report href builders", () => {
  it("builds markdown and html hrefs for each view", () => {
    expect(reportHref("audit", "markdown")).toBe("/evidence/report?view=audit");
    expect(reportHref("engineering", "markdown")).toBe(
      "/evidence/report?view=engineering",
    );
    expect(reportHref("audit", "html")).toBe(
      "/evidence/report/html?view=audit",
    );
    expect(reportHref("engineering", "html")).toBe(
      "/evidence/report/html?view=engineering",
    );
  });
});