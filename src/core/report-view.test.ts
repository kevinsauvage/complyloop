import { describe, expect, it } from "vitest";
import {
  parseReportViewParam,
  reportHtmlHref,
  reportMarkdownHref,
} from "./report-view";

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
    expect(reportMarkdownHref("audit")).toBe("/evidence/report?view=audit");
    expect(reportMarkdownHref("engineering")).toBe(
      "/evidence/report?view=engineering",
    );
    expect(reportHtmlHref("audit")).toBe(
      "/evidence/report/html?view=audit",
    );
    expect(reportHtmlHref("engineering")).toBe(
      "/evidence/report/html?view=engineering",
    );
  });
});