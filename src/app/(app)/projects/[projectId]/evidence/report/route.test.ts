import { describe, expect, it, vi } from "vitest";

const loadReportInput = vi.hoisted(() => vi.fn());
const buildAuditReportMarkdown = vi.hoisted(() => vi.fn());
const buildEngineeringReportMarkdown = vi.hoisted(() => vi.fn());

vi.mock("@/server/reporting/report", () => ({
  loadReportInput: (...args: unknown[]) => loadReportInput(...args),
}));

vi.mock("@/server/reporting/report-markdown", () => ({
  buildAuditReportMarkdown: (...args: unknown[]) =>
    buildAuditReportMarkdown(...args),
  buildEngineeringReportMarkdown: (...args: unknown[]) =>
    buildEngineeringReportMarkdown(...args),
}));

import { GET } from "./route";

const request = new Request(
  "http://localhost/projects/p1/evidence/report?view=audit",
);
const context = { params: Promise.resolve({ projectId: "p1" }) };

function okContext(view: "audit" | "engineering") {
  return {
    ok: true as const,
    project: { name: "My Shop" },
    view,
    input: {},
  };
}

describe("GET /evidence/report", () => {
  it("passes through the loader's error response", async () => {
    loadReportInput.mockResolvedValue({
      ok: false,
      response: new Response("No project", { status: 404 }),
    });
    const response = await GET(request, context);
    expect(response.status).toBe(404);
  });

  it("downloads the audit markdown with a sanitized filename", async () => {
    loadReportInput.mockResolvedValue(okContext("audit"));
    buildAuditReportMarkdown.mockReturnValue("# Audit");
    const response = await GET(request, context);
    expect(response.headers.get("Content-Type")).toContain("text/markdown");
    expect(response.headers.get("Content-Disposition")).toContain(
      'filename="audit-report-My-Shop.md"',
    );
    await expect(response.text()).resolves.toBe("# Audit");
  });

  it("builds the engineering report when requested", async () => {
    loadReportInput.mockResolvedValue(okContext("engineering"));
    buildEngineeringReportMarkdown.mockReturnValue("# Engineering");
    const response = await GET(request, context);
    await expect(response.text()).resolves.toBe("# Engineering");
  });
});
