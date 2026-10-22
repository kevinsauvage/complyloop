import { describe, expect, it, vi } from "vitest";

import { RateLimitError } from "@/server/rate-limit";

const getWorkspace = vi.hoisted(() => vi.fn());
const requireProjectAccess = vi.hoisted(() => vi.fn());
const loadEvidenceExport = vi.hoisted(() => vi.fn());
const assertExportRateLimit = vi.hoisted(() => vi.fn());

vi.mock("@/server/workspace/workspace", () => ({
  getWorkspace: (...args: unknown[]) => getWorkspace(...args),
  requireProjectAccess: (...args: unknown[]) => requireProjectAccess(...args),
}));

vi.mock("@/server/reporting/evidence-queries", () => ({
  loadEvidenceExport: (...args: unknown[]) => loadEvidenceExport(...args),
}));

vi.mock("@/server/reporting/report", () => ({
  frameworkForProject: () => ({ id: "rgaa", name: "RGAA 4" }),
}));

vi.mock("@/server/workspace/project-scope", () => ({
  controlsInScope: () => [],
  requirementsInScope: () => [],
}));

vi.mock("@/server/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/rate-limit")>();
  return {
    ...actual,
    assertExportRateLimit: (...args: unknown[]) =>
      assertExportRateLimit(...args),
  };
});

import { GET } from "./route";

const project = {
  id: "p1",
  name: "Shop",
  createdAt: "2026-01-01T00:00:00.000Z",
};

const context = { params: Promise.resolve({ projectId: "p1" }) };

describe("GET /evidence/export", () => {
  it("returns 404 when the URL's project is not visible", async () => {
    getWorkspace.mockResolvedValue({ userId: "u1" });
    requireProjectAccess.mockRejectedValue(new Error("Unknown project."));
    const response = await GET(new Request("http://localhost/"), context);
    expect(response.status).toBe(404);
  });

  it("downloads a JSON export for the project in the URL", async () => {
    getWorkspace.mockResolvedValue({ userId: "u1" });
    requireProjectAccess.mockResolvedValue(project);
    loadEvidenceExport.mockResolvedValue({
      exported: { records: [], total: 0, limit: 5000, truncated: false },
      requirements: [],
    });
    const response = await GET(new Request("http://localhost/"), context);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("application/json");
    expect(response.headers.get("Content-Disposition")).toContain(
      "evidence.json",
    );
    expect(requireProjectAccess).toHaveBeenCalledWith("p1", "project.view");
    const body = (await response.json()) as { project: { name: string } };
    expect(body.project.name).toBe("Shop");
  });

  it("returns 429 when the export rate limit is exhausted", async () => {
    getWorkspace.mockResolvedValue({ userId: "u1" });
    requireProjectAccess.mockResolvedValue(project);
    assertExportRateLimit.mockRejectedValueOnce(new RateLimitError());
    const response = await GET(new Request("http://localhost/"), context);
    expect(response.status).toBe(429);
    expect(loadEvidenceExport).not.toHaveBeenCalled();
  });

  it("rethrows non-rate-limit failures instead of masking them as 429", async () => {
    getWorkspace.mockResolvedValue({ userId: "u1" });
    requireProjectAccess.mockResolvedValue(project);
    assertExportRateLimit.mockRejectedValueOnce(new Error("db down"));
    await expect(
      GET(new Request("http://localhost/"), context),
    ).rejects.toThrow(/db down/);
  });
});
