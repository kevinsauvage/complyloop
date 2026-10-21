import { describe, expect, it, vi } from "vitest";

const loadReportInput = vi.hoisted(() => vi.fn());
const buildAuditReportHtml = vi.hoisted(() => vi.fn());
const buildEngineeringReportHtml = vi.hoisted(() => vi.fn());

vi.mock("@/server/reporting/report", () => ({
  loadReportInput: (...args: unknown[]) => loadReportInput(...args),
}));

vi.mock("@/server/reporting/report-html/report", () => ({
  buildAuditReportHtml: (...args: unknown[]) => buildAuditReportHtml(...args),
  buildEngineeringReportHtml: (...args: unknown[]) =>
    buildEngineeringReportHtml(...args),
}));

import { GET } from "./route";

const request = new Request("http://localhost/evidence/report/html");

describe("GET /evidence/report/html", () => {
  it("passes through the loader's error response", async () => {
    loadReportInput.mockResolvedValue({
      ok: false,
      response: new Response("Forbidden", { status: 403 }),
    });
    const response = await GET(request);
    expect(response.status).toBe(403);
  });

  it("returns the audit report as HTML", async () => {
    loadReportInput.mockResolvedValue({
      ok: true,
      project: { name: "Shop" },
      view: "audit",
      input: {},
    });
    buildAuditReportHtml.mockReturnValue("<html>audit</html>");
    const response = await GET(request);
    expect(response.headers.get("Content-Type")).toContain("text/html");
    await expect(response.text()).resolves.toBe("<html>audit</html>");
  });
});
