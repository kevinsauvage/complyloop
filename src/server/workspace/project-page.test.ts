import { beforeEach, describe, expect, it, vi } from "vitest";

import type { OrgMembership } from "@complyloop/analysis-core/contract/project-types";

import { testProject } from "@/test-fixtures/project";

const getWorkspace = vi.hoisted(() => vi.fn());
const notFound = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  notFound: () => {
    notFound();
    // Next signals a 404 by throwing; mirror that so control flow is real.
    throw new Error("NEXT_NOT_FOUND");
  },
}));

vi.mock("./workspace", () => ({
  getWorkspace,
}));

import { loadProjectPage } from "./project-page";

const visibleProject = testProject({ id: "p1", orgId: "org-1" });

function membership(
  orgId: string,
  role: OrgMembership["role"] = "member",
): OrgMembership {
  return {
    id: `m-${orgId}`,
    orgId,
    userId: "user-1",
    role,
    githubLogin: "alice",
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function workspaceFor(projects: (typeof visibleProject)[]) {
  return {
    userId: "user-1",
    githubLogin: "alice",
    access: {
      userId: "user-1",
      githubLogin: "alice",
      organizations: [],
      memberships: [membership("org-1")],
    },
    projects,
    organizations: [],
    activeOrgId: "org-1",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("loadProjectPage", () => {
  it("resolves the project named in the URL and derives its capabilities", async () => {
    getWorkspace.mockResolvedValue(workspaceFor([visibleProject]));

    const page = await loadProjectPage("p1");

    expect(page.project.id).toBe("p1");
    expect(page.caps.canView).toBe(true);
    expect(page.caps.canAssess).toBe(true);
    expect(notFound).not.toHaveBeenCalled();
  });

  it("404s on an unknown project id", async () => {
    getWorkspace.mockResolvedValue(workspaceFor([visibleProject]));

    await expect(loadProjectPage("missing")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalledOnce();
  });

  it("404s on a project the viewer is not a member of, never falling back", async () => {
    // A global id from another org must not resolve to a project this viewer
    // can see — the URL is the only source of truth, and it fails closed.
    getWorkspace.mockResolvedValue(workspaceFor([visibleProject]));

    await expect(loadProjectPage("p2")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalledOnce();
  });

  it("gives a viewer read-only capabilities for the URL's project", async () => {
    getWorkspace.mockResolvedValue({
      ...workspaceFor([visibleProject]),
      access: {
        userId: "user-1",
        githubLogin: "alice",
        organizations: [],
        memberships: [membership("org-1", "viewer")],
      },
    });

    const page = await loadProjectPage("p1");

    expect(page.caps).toEqual({
      canView: true,
      canAssess: false,
      canRemediate: false,
      canDecide: false,
      canConnect: false,
    });
    expect(notFound).not.toHaveBeenCalled();
  });
});
