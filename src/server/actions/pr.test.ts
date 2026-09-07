import "@/test-fixtures/register-action-workspace-mock";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "../db";
import { actionWorkspaceMocks, clearProjectWritePayloads, invokeProjectWriteMock, projectWritePayload } from "@/test-fixtures/action-workspace-mocks";
import { testFinding } from "@/test-fixtures/finding";
import { testProject } from "@/test-fixtures/project";
import { testRemediation } from "@/test-fixtures/remediation";
import { testWorkspace } from "@/test-fixtures/workspace";
import { PublicError } from "@complyloop/db/types";
import { createPullRequestAction } from "./pr";

const { getWorkspace, withProjectWrite } = actionWorkspaceMocks;
const preparePullRequest = vi.hoisted(() => vi.fn());
const getGitHubAccessToken = vi.hoisted(() => vi.fn());
const getDrizzle = vi.hoisted(() => vi.fn());
const listEvidenceForFinding = vi.hoisted(() => vi.fn());
const refresh = vi.hoisted(() => vi.fn());

vi.mock("@/auth", () => ({
  getGitHubAccessToken: () => getGitHubAccessToken(),
}));

vi.mock("../pr", () => ({
  preparePullRequest: (...args: unknown[]) => preparePullRequest(...args),
}));

vi.mock("@complyloop/db/client", () => ({
  getDrizzle: () => getDrizzle(),
}));

vi.mock("@complyloop/db/queries", () => ({
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

const finding = testFinding();
const remediation = testRemediation({ status: "approved" });

function workspaceFor(
  role: "viewer" | "member" | "admin" | "owner",
  overrides: Partial<Db> = {},
) {
  return testWorkspace({
    role,
    project,
    findings: [finding],
    remediations: [remediation],
    db: {
      ...overrides,
    },
  });
}

afterEach(() => {
  clearProjectWritePayloads();
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
    withProjectWrite.mockImplementation(async (_scope, fn) => invokeProjectWriteMock(workspace, fn));
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
    expect(projectWritePayload()?.evidence?.some((row) => row.kind === "pull_request_prepared")).toBe(
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
    withProjectWrite.mockImplementation(async (_scope, fn) => invokeProjectWriteMock(workspace, fn));
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

    expect(projectWritePayload()?.remediations?.[0]?.status).toBe("approved");
    expect(projectWritePayload()?.remediations?.[0]?.approvalAction).toBe(
      "create_draft_pull_request",
    );
    expect(
      projectWritePayload()?.evidence?.some(
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
