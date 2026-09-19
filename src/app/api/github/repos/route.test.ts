import { describe, expect, it, vi } from "vitest";

import { GET } from "./route";

const getSession = vi.hoisted(() => vi.fn());
const getWorkspace = vi.hoisted(() => vi.fn());
const projectCapabilities = vi.hoisted(() => vi.fn());
const getGitHubAccessToken = vi.hoisted(() => vi.fn());
const listAvailableRepos = vi.hoisted(() => vi.fn());

vi.mock("@/server/auth-session", () => ({
  getSession: (...args: unknown[]) => getSession(...args),
}));

vi.mock("@/server/workspace/workspace", () => ({
  getWorkspace: (...args: unknown[]) => getWorkspace(...args),
}));

vi.mock("@/server/workspace/project-capabilities", () => ({
  projectCapabilities: (...args: unknown[]) => projectCapabilities(...args),
}));

vi.mock("@/server/github/access-token", () => ({
  getGitHubAccessToken: (...args: unknown[]) => getGitHubAccessToken(...args),
}));

vi.mock("@/server/github/github-connector", () => ({
  listAvailableRepos: (...args: unknown[]) => listAvailableRepos(...args),
}));

function getRequest(): Request {
  return new Request("http://localhost/api/github/repos");
}

describe("GET /api/github/repos", () => {
  it("returns 401 without a session", async () => {
    getSession.mockResolvedValue(null);
    const response = await GET(getRequest());
    expect(response.status).toBe(401);
    expect(listAvailableRepos).not.toHaveBeenCalled();
  });

  it("returns 403 when the workspace cannot connect repos", async () => {
    getSession.mockResolvedValue({ user: { id: "user-1" } });
    getWorkspace.mockResolvedValue({
      project: { id: "p1" },
      access: {},
      activeOrgId: "org-1",
    });
    projectCapabilities.mockReturnValue({ canConnect: false });
    const response = await GET(getRequest());
    expect(response.status).toBe(403);
    expect(listAvailableRepos).not.toHaveBeenCalled();
  });

  it("lists repos for an authorized connector", async () => {
    getSession.mockResolvedValue({ user: { id: "user-1" } });
    getWorkspace.mockResolvedValue({
      project: { id: "p1" },
      access: {},
      activeOrgId: "org-1",
    });
    projectCapabilities.mockReturnValue({ canConnect: true });
    getGitHubAccessToken.mockResolvedValue("token-123");
    listAvailableRepos.mockResolvedValue([{ fullName: "acme/app" }]);
    const response = await GET(getRequest());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      repos: [{ fullName: "acme/app" }],
      hasMore: false,
    });
  });
});
