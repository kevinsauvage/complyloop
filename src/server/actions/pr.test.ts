import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Control, OrgMembership } from "@/core/project-types";
import type { Finding, Remediation } from "@/core/finding-types";
import { testProject } from "@/test-fixtures/project";
import { PublicError } from "@/core/public-error";
import type { Db } from "../db";
import type { Workspace } from "../workspace";
import { createPullRequestAction } from "./pr";

const getWorkspace = vi.hoisted(() => vi.fn());
const withWorkspaceWrite = vi.hoisted(() => vi.fn());
const preparePullRequest = vi.hoisted(() => vi.fn());
const getGitHubAccessToken = vi.hoisted(() => vi.fn());
const getDrizzle = vi.hoisted(() => vi.fn());
const listEvidenceForFinding = vi.hoisted(() => vi.fn());
const refresh = vi.hoisted(() => vi.fn());

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/auth", () => ({
  getGitHubAccessToken: () => getGitHubAccessToken(),
}));

vi.mock("../workspace", async () => {
  const actual = await vi.importActual<typeof import("../workspace")>(
    "../workspace",
  );
  return {
    ...actual,
    getWorkspace: () => getWorkspace(),
    withWorkspaceWrite: (fn: (workspace: Workspace) => unknown) =>
      withWorkspaceWrite(fn),
  };
});

vi.mock("../pr", () => ({
  preparePullRequest: (...args: unknown[]) => preparePullRequest(...args),
}));

vi.mock("../db-store/client", () => ({
  getDrizzle: () => getDrizzle(),
}));

vi.mock("../db-store/postgres-queries", () => ({
  listEvidenceForFinding: (...args: unknown[]) =>
    listEvidenceForFinding(...args),
}));

vi.mock("./shared", async () => {
  const actual = await vi.importActual<typeof import("./shared")>("./shared");
  return {
    ...actual,
    refresh: () => refresh(),
  };
});

const project = testProject({
  orgId: "org-1",
  github: {
    fullName: "acme/shop",
    defaultBranch: "main",
    private: false,
  },
});

const control: Control = {
  id: "c1",
  frameworkId: "fw",
  code: "1.1.1",
  secondaryCode: "WCAG",
  title: "Images",
  description: "Alt text",
  checkId: "img-alt",
};

const finding: Finding = {
  id: "f1",
  projectId: "p1",
  controlId: "c1",
  assessmentId: "a1",
  checkId: "img-alt",
  kind: "violation",
  status: "open",
  severity: "serious",
  confidence: "high",
  reason: "Missing alt",
  location: {
    kind: "source",
    filePath: "App.tsx",
    line: 1,
    column: 1,
    snippet: '<img src="x" />',
    span: { start: 0, end: 16 },
  },
  fix: null,
  explanations: [],
  detectedAt: "2026-01-01T00:00:00.000Z",
};

const remediation: Remediation = {
  id: "r1",
  findingId: "f1",
  status: "approved",
  suggestion: {
    description: "Add alt",
    proposedSnippet: '<img alt="" />',
    provenance: "deterministic",
  },
  history: [],
};

function membership(role: OrgMembership["role"]): OrgMembership {
  return {
    id: "m1",
    orgId: "org-1",
    role,
    userId: "user-1",
    githubLogin: "alice",
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function workspaceFor(
  role: OrgMembership["role"],
  overrides: Partial<Db> = {},
): Workspace {
  const db = {
    frameworks: [],
    controls: [control],
    organizations: [{ id: "org-1", name: "Acme", slug: "acme", createdAt: "" }],
    memberships: [membership(role)],
    projects: [project],
    requirements: [],
    assessments: [],
    findings: [{ ...finding }],
    remediations: [{ ...remediation }],
    evidence: [],
    alerts: [],
    ...overrides,
  } as Db;

  return {
    db,
    project,
    userId: "user-1",
    githubLogin: "alice",
    access: {
      userId: "user-1",
      githubLogin: "alice",
      organizations: db.organizations,
      memberships: db.memberships,
    },
    visibleProjects: [project],
    organizations: db.organizations,
    activeOrgId: "org-1",
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

beforeEach(() => {
  getDrizzle.mockResolvedValue({});
  listEvidenceForFinding.mockResolvedValue([
    {
      kind: "ai_patch_ready",
      summary: "Patch ready",
      detail: {
        description: "Add alt",
        provenance: "ai",
        model: "minimax/minimax-m3",
        edits: [
          {
            path: "App.tsx",
            oldText: '<img src="x" />',
            newText: '<img src="x" alt="X" />',
          },
        ],
        complyLoopPassed: true,
        remaining: [],
      },
    },
  ]);
});

describe("createPullRequestAction", () => {
  it("denies viewers", async () => {
    getWorkspace.mockResolvedValue(workspaceFor("viewer"));
    const result = await createPullRequestAction("f1", {
      error: null,
      message: null,
      prUrl: null,
    }, new FormData());
    expect(result.error).toMatch(/Not allowed/);
    expect(result.prUrl).toBeNull();
  });

  it("returns an error when the project is missing", async () => {
    getWorkspace.mockResolvedValue(
      workspaceFor("member", { projects: [] }),
    );
    const result = await createPullRequestAction("f1", {
      error: null,
      message: null,
      prUrl: null,
    }, new FormData());
    expect(result.error).toBe("Unknown project.");
  });

  it("records evidence when a PR is prepared", async () => {
    const workspace = workspaceFor("member");
    getWorkspace.mockResolvedValue(workspace);
    withWorkspaceWrite.mockImplementation(async (fn) => fn(workspace));
    getGitHubAccessToken.mockResolvedValue("gho_token");
    preparePullRequest.mockResolvedValue({
      branch: "fix/img-alt",
      prUrl: "https://github.com/acme/shop/pull/1",
      title: "fix: alt text",
      message: "Opened pull request.",
    });

    const result = await createPullRequestAction("f1", {
      error: null,
      message: null,
      prUrl: null,
    }, new FormData());

    expect(result).toEqual({
      error: null,
      message: "Opened pull request.",
      prUrl: "https://github.com/acme/shop/pull/1",
    });
    expect(workspace.db.evidence.some((row) => row.kind === "pull_request_prepared")).toBe(
      true,
    );
    expect(refresh).toHaveBeenCalled();
  });

  it("records draft PR creation as explicit remediation approval", async () => {
    const workspace = workspaceFor("member");
    workspace.db.remediations[0] = {
      ...remediation,
      status: "suggested",
    };
    getWorkspace.mockResolvedValue(workspace);
    withWorkspaceWrite.mockImplementation(async (fn) => fn(workspace));
    getGitHubAccessToken.mockResolvedValue("gho_token");
    preparePullRequest.mockResolvedValue({
      branch: "fix/img-alt",
      prUrl: "https://github.com/acme/shop/pull/1",
      title: "fix: alt text",
      message: "Opened draft pull request.",
    });

    await createPullRequestAction("f1", {
      error: null,
      message: null,
      prUrl: null,
    }, new FormData());

    expect(workspace.db.remediations[0]?.status).toBe("approved");
    expect(
      workspace.db.evidence.some(
        (row) => row.kind === "remediation_approved",
      ),
    ).toBe(true);
  });

  it("maps prepare failures into form state", async () => {
    getWorkspace.mockResolvedValue(workspaceFor("member"));
    getGitHubAccessToken.mockResolvedValue(null);
    preparePullRequest.mockRejectedValue(
      new PublicError("GitHub token unavailable."),
    );

    const result = await createPullRequestAction("f1", {
      error: null,
      message: null,
      prUrl: null,
    }, new FormData());

    expect(result.error).toMatch(/GitHub token unavailable/);
    expect(result.prUrl).toBeNull();
  });

  it("requires a persisted verified patch candidate", async () => {
    getWorkspace.mockResolvedValue(workspaceFor("member"));
    listEvidenceForFinding.mockResolvedValue([]);

    const result = await createPullRequestAction(
      "f1",
      { error: null, message: null, prUrl: null },
      new FormData(),
    );

    expect(result.error).toMatch(/Generate and review/);
    expect(preparePullRequest).not.toHaveBeenCalled();
  });
});
