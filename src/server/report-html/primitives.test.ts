import { describe, expect, it } from "vitest";
import { emptyParagraph, escapeHtml, reportSection, reportShell, statusClass, summaryStat } from "./primitives";

describe("escapeHtml", () => {
  it("escapes the five HTML-significant characters", () => {
    expect(escapeHtml(`&<>"`)).toBe("&amp;&lt;&gt;&quot;");
  });

  it("leaves plain text unchanged", () => {
    expect(escapeHtml("No special chars 123")).toBe("No special chars 123");
  });
});

describe("statusClass", () => {
  it("maps every requirement status to a CSS class", () => {
    expect(statusClass("passed")).toBe("status-passed");
    expect(statusClass("failed")).toBe("status-failed");
    expect(statusClass("needs_review")).toBe("status-needs-review");
    expect(statusClass("not_applicable")).toBe("status-not-applicable");
    expect(statusClass("unable_to_verify")).toBe("status-unable");
  });

  it("throws on an unrecognized status", () => {
    expect(() => statusClass("bogus" as never)).toThrow(
      /Unhandled requirement status/,
    );
  });
});

describe("emptyParagraph", () => {
  it("renders an escaped empty-state message", () => {
    expect(emptyParagraph('No "<items>"')).toContain("class=\"empty\"");
    expect(emptyParagraph('No "<items>"')).toContain("&lt;items&gt;");
  });
});

describe("reportSection", () => {
  it("wraps body content in a titled section", () => {
    const html = reportSection("summary", "Summary", "<p>Body</p>");

    expect(html).toContain('id="summary"');
    expect(html).toContain("<h2>Summary</h2>");
    expect(html).toContain("<p>Body</p>");
  });
});

describe("summaryStat", () => {
  it("renders a labeled stat with escaped values", () => {
    const html = summaryStat('Open "<findings>"', 3);

    expect(html).toContain('class="summary-stat"');
    expect(html).toContain("&lt;findings&gt;");
    expect(html).toContain(">3<");
  });
});

describe("reportShell", () => {
  const header = {
    title: 'Audit "report"',
    projectName: 'Demo "<project>"',
    frameworkName: "RGAA",
    frameworkVersion: "4.1.2",
    sourceKind: "github",
    sourceRef: "acme/demo",
    exportedAt: "2026-01-02T12:00:00.000Z",
  };

  it("wraps body sections in a printable HTML shell with escaped metadata", () => {
    const html = reportShell(header, "<section>Body</section>");

    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("<style>");
    expect(html).toContain("<section>Body</section>");
    expect(html).not.toContain("<script");
    expect(html).toContain("&lt;project&gt;");
    expect(html).toContain("window.print()");
  });

  it("includes GitHub metadata when present on the header model", () => {
    const html = reportShell(
      { ...header, githubFullName: "acme/demo" },
      "<section>Body</section>",
    );

    expect(html).toContain("<strong>GitHub:</strong>");
    expect(html).toContain("acme/demo");
  });

  it("renders both source kind and ref", () => {
    const html = reportShell(
      { ...header, sourceKind: "github", sourceRef: "main" },
      "<section>Body</section>",
    );

    expect(html).toContain("<strong>Source:</strong> github — main");
  });
});
