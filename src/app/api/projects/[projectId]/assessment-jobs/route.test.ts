import { describe, expect, it, vi } from "vitest";

import { GET } from "./route";

const recentAssessmentJobsForProject = vi.hoisted(() => vi.fn());
const viewerCanViewProject = vi.hoisted(() => vi.fn());

vi.mock("@/server/assessment/assessment-jobs", () => ({
  recentAssessmentJobsForProject: (...args: unknown[]) =>
    recentAssessmentJobsForProject(...args),
}));

vi.mock("@/server/workspace/workspace", () => ({
  viewerCanViewProject: (...args: unknown[]) =>
    viewerCanViewProject(...args),
}));

function getRequest(projectId: string): [Request, { params: Promise<{ projectId: string }> }] {
  return [
    new Request(`http://localhost/api/projects/${projectId}/assessment-jobs`),
    { params: Promise.resolve({ projectId }) },
  ];
}

describe("GET /api/projects/[projectId]/assessment-jobs", () => {
  it("returns 404 for an invalid project id", async () => {
    const [request, ctx] = getRequest("");
    const response = await GET(request, ctx);
    expect(response.status).toBe(404);
    expect(viewerCanViewProject).not.toHaveBeenCalled();
  });

  it("returns 404 when the viewer cannot see the project", async () => {
    viewerCanViewProject.mockResolvedValue(false);
    const [request, ctx] = getRequest("p1");
    const response = await GET(request, ctx);
    expect(response.status).toBe(404);
    expect(recentAssessmentJobsForProject).not.toHaveBeenCalled();
  });

  it("returns recent jobs for an authorized viewer", async () => {
    viewerCanViewProject.mockResolvedValue(true);
    recentAssessmentJobsForProject.mockResolvedValue([{ id: "job-1" }]);
    const [request, ctx] = getRequest("p1");
    const response = await GET(request, ctx);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      jobs: [{ id: "job-1" }],
    });
    expect(recentAssessmentJobsForProject).toHaveBeenCalledWith("p1");
  });
});
