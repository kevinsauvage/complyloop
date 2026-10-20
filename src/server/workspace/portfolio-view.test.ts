import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PortfolioProjectRow } from "@complyloop/db/repo/portfolio";

import { testProject } from "@/test-fixtures/project";
import { testWorkspace } from "@/test-fixtures/workspace";

const getWorkspace = vi.hoisted(() => vi.fn());
const getDrizzle = vi.hoisted(() => vi.fn());
const listPortfolioForProjects = vi.hoisted(() => vi.fn());

vi.mock("./workspace", () => ({ getWorkspace }));
vi.mock("@complyloop/db/postgres", () => ({ getDrizzle }));
vi.mock("@complyloop/db/repo/portfolio", () => ({ listPortfolioForProjects }));

import { portfolioJobStatus } from "@/core/portfolio";

import { loadPortfolioView } from "./portfolio-view";

const orgId = "org-1";

function row(
  projectId: string,
  overrides: Partial<PortfolioProjectRow> = {},
): PortfolioProjectRow {
  return {
    projectId,
    requirements: {
      passed: 0,
      failed: 0,
      needs_review: 0,
      not_applicable: 0,
      unable_to_verify: 0,
    },
    openViolations: 0,
    unreadAlerts: 0,
    lastCompletedAt: null,
    latestJobStatus: null,
    latestJobAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getDrizzle.mockResolvedValue({});
});

describe("loadPortfolioView", () => {
  it("returns no rows without an active org", async () => {
    getWorkspace.mockResolvedValue({
      ...testWorkspace({ role: "member", project: testProject({ orgId }) }),
      activeOrgId: null,
    });

    await expect(loadPortfolioView()).resolves.toEqual({
      org: null,
      rows: [],
      canCreateProject: false,
    });
    expect(listPortfolioForProjects).not.toHaveBeenCalled();
  });

  it("only queries projects the viewer can see in the active org", async () => {
    const visible = testProject({ id: "p-visible", orgId });
    const otherOrg = testProject({ id: "p-other-org", orgId: "org-2" });
    const workspace = testWorkspace({
      role: "member",
      project: visible,
      db: { projects: [visible, otherOrg] },
    });
    getWorkspace.mockResolvedValue(workspace);
    listPortfolioForProjects.mockResolvedValue([row(visible.id)]);

    const { org, rows } = await loadPortfolioView();

    expect(org).toEqual({ id: orgId, name: "Acme" });
    expect(listPortfolioForProjects).toHaveBeenCalledWith({}, [visible.id]);
    expect(rows.map((entry) => entry.project.id)).toEqual([visible.id]);
  });

  it("sorts by what needs attention, then by staleness", async () => {
    const stale = testProject({ id: "p-stale", orgId, name: "Zeta" });
    const failing = testProject({ id: "p-failing", orgId, name: "Alpha" });
    const review = testProject({ id: "p-review", orgId, name: "Beta" });
    const workspace = testWorkspace({
      role: "member",
      project: failing,
      db: { projects: [stale, failing, review] },
    });
    getWorkspace.mockResolvedValue(workspace);
    listPortfolioForProjects.mockResolvedValue([
      row(stale.id),
      row(failing.id, {
        requirements: {
          passed: 2,
          failed: 3,
          needs_review: 1,
          not_applicable: 0,
          unable_to_verify: 1,
        },
        openViolations: 7,
        lastCompletedAt: "2026-02-01T00:00:00.000Z",
      }),
      row(review.id, {
        requirements: {
          passed: 1,
          failed: 1,
          needs_review: 2,
          not_applicable: 0,
          unable_to_verify: 0,
        },
        lastCompletedAt: "2026-01-01T00:00:00.000Z",
      }),
    ]);

    const { rows } = await loadPortfolioView();

    // failing (4 attention) → review (3) → never assessed.
    expect(rows.map((entry) => entry.project.id)).toEqual([
      failing.id,
      review.id,
      stale.id,
    ]);
    expect(rows[0]?.attention).toBe(4);
    expect(rows[2]?.lastCompletedAt).toBeNull();
  });

  it("fails loud when the grouped query drops a requested project", async () => {
    const workspace = testWorkspace({
      role: "member",
      project: testProject({ id: "p1", orgId }),
    });
    getWorkspace.mockResolvedValue(workspace);
    listPortfolioForProjects.mockResolvedValue([]);

    await expect(loadPortfolioView()).rejects.toThrow(/Portfolio row missing/);
  });

  it("treats an unknown job status as no pipeline state", () => {
    expect(portfolioJobStatus({ latestJobStatus: "queued" })).toBe("queued");
    expect(portfolioJobStatus({ latestJobStatus: "teleported" })).toBeNull();
    expect(portfolioJobStatus({ latestJobStatus: null })).toBeNull();
  });
});

describe("visibility", () => {
  it("excludes a project whose org the viewer does not belong to", async () => {
    const project = testProject({ id: "p1", orgId });
    const workspace = testWorkspace({
      role: "member",
      project,
      db: { memberships: [] },
    });
    getWorkspace.mockResolvedValue(workspace);

    await expect(loadPortfolioView()).resolves.toEqual({
      org: { id: orgId, name: "Acme" },
      rows: [],
      // No membership in the org: nothing to see, nothing to create.
      canCreateProject: false,
    });
    expect(listPortfolioForProjects).not.toHaveBeenCalled();
  });
});
