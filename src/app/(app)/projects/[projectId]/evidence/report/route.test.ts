import { describe, expect, it, vi } from "vitest";

const loadReportInput = vi.hoisted(() => vi.fn());
const buildReportMarkdown = vi.hoisted(() => vi.fn());

vi.mock("@/server/reporting/report", () => ({
  loadReportInput: (...args: unknown[]) => loadReportInput(...args),
}));

vi.mock("@/server/reporting/report-markdown", () => ({
  buildReportMarkdown: (...args: unknown[]) => buildReportMarkdown(...args),
}));

import { GET } from "./route";

const request = new Request("http://localhost/projects/p1/evidence/report");
const context = { params: Promise.resolve({ projectId: "p1" }) };

describe("GET /evidence/report", () => {
  it("passes through the loader's error response", async () => {
    loadReportInput.mockResolvedValue({
      ok: false,
      response: new Response("No project", { status: 404 }),
    });
    const response = await GET(request, context);
    expect(response.status).toBe(404);
  });

  it("downloads the engineering markdown with a sanitized filename", async () => {
    loadReportInput.mockResolvedValue({
      ok: true,
      project: { name: "My Shop" },
      input: {},
    });
    buildReportMarkdown.mockReturnValue("# Engineering");
    const response = await GET(request, context);
    expect(response.headers.get("Content-Type")).toContain("text/markdown");
    expect(response.headers.get("Content-Disposition")).toContain(
      'filename="engineering-report-My-Shop.md"',
    );
    await expect(response.text()).resolves.toBe("# Engineering");
  });
});
