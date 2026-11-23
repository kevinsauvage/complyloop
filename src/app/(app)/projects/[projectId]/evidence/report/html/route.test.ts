import { describe, expect, it, vi } from "vitest";

const loadReportInput = vi.hoisted(() => vi.fn());
const buildReportHtml = vi.hoisted(() => vi.fn());

vi.mock("@/server/reporting/report", () => ({
  loadReportInput: (...args: unknown[]) => loadReportInput(...args),
}));

vi.mock("@/server/reporting/report-html/report", () => ({
  buildReportHtml: (...args: unknown[]) => buildReportHtml(...args),
}));

import { GET } from "./route";

const request = new Request(
  "http://localhost/projects/p1/evidence/report/html",
);
const context = { params: Promise.resolve({ projectId: "p1" }) };

describe("GET /evidence/report/html", () => {
  it("passes through the loader's error response", async () => {
    loadReportInput.mockResolvedValue({
      ok: false,
      response: new Response("Forbidden", { status: 403 }),
    });
    const response = await GET(request, context);
    expect(response.status).toBe(403);
  });

  it("returns the audit report as HTML", async () => {
    loadReportInput.mockResolvedValue({
      ok: true,
      project: { name: "Shop" },
      input: {},
    });
    buildReportHtml.mockResolvedValue("<html>audit</html>");
    const response = await GET(request, context);
    expect(response.headers.get("Content-Type")).toContain("text/html");
    await expect(response.text()).resolves.toBe("<html>audit</html>");
  });

  it("hands the request's CSP nonce to the report script", async () => {
    loadReportInput.mockResolvedValue({
      ok: true,
      project: { name: "Shop" },
      input: {},
    });
    buildReportHtml.mockResolvedValue("<html>audit</html>");
    await GET(
      new Request("http://localhost/projects/p1/evidence/report/html", {
        headers: { "x-nonce": "abc123" },
      }),
      context,
    );
    expect(buildReportHtml).toHaveBeenCalledWith({}, "abc123");
  });
});
