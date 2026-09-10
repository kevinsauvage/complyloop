import "@/test-fixtures/register-action-workspace-mock";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@complyloop/db/types";
import { actionWorkspaceMocks, clearProjectWritePayloads, invokeProjectWriteMock, projectWritePayload } from "@/test-fixtures/action-workspace-mocks";
import { testFinding } from "@/test-fixtures/finding";
import { testProject } from "@/test-fixtures/project";
import { testRemediation } from "@/test-fixtures/remediation";
import { testWorkspace } from "@/test-fixtures/workspace";
import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import { createPullRequestAction } from "./pr";

const { getWorkspace, withProjectWrite } = actionWorkspaceMocks;
const preparePullRequest = vi.hoisted(() => vi.fn());
const getDrizzle = vi.hoisted(() => vi.fn());
const listEvidenceForFinding = vi.hoisted(() => vi.fn());
const refresh = vi.hoisted(() => vi.fn());

vi.mock("../pr", () => ({
  preparePullRequest: (...args: unknown[]) => preparePullRequest(...args),
}));

vi.mock("@complyloop/db/postgres", () => ({
  getDrizzle: () => getDrizzle(),
}));

vi.mock("@complyloop/db/repo/evidence", () => ({
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
      ok: false,
      message: null,
      prUrl: null,
    }, new FormData());
    expect((result.ok ? null : result.message)).toMatch(/Not allowed/);
    expect(result.prUrl).toBeNull();
  });

  it("returns an error when the project is missing", async () => {
    getWorkspace.mockResolvedValue(
      workspaceFor("member", { projects: [] }),
    );
    const result = await createPullRequestAction("f1", {
      ok: false,
      message: null,
      prUrl: null,
    }, new FormData());
    expect((result.ok ? null : result.message)).toBe("Unknown project.");
  });

  it("records evidence when a PR is prepared", async () => {
    const workspace = workspaceFor("member");
    getWorkspace.mockResolvedValue(workspace);
    withProjectWrite.mockImplementation(async (fn) => invokeProjectWriteMock(workspace, fn));
    preparePullRequest.mockResolvedValue({
      branch: "fix/img-alt",
      prUrl: "https://github.com/acme/shop/pull/1",
      title: "fix: alt text",
      message: "Opened pull request.",
    });

    const result = await createPullRequestAction("f1", {
      ok: false,
      message: null,
      prUrl: null,
    }, new FormData());

    expect(result).toEqual({
      ok: true,
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
    withProjectWrite.mockImplementation(async (fn) => invokeProjectWriteMock(workspace, fn));
    preparePullRequest.mockResolvedValue({
      branch: "fix/img-alt",
      prUrl: "https://github.com/acme/shop/pull/1",
      title: "fix: alt text",
      message: "Opened draft pull request.",
    });

    await createPullRequestAction("f1", {
      ok: false,
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
    preparePullRequest.mockRejectedValue(
      new PublicError("GitHub token unavailable."),
    );

    const result = await createPullRequestAction("f1", {
      ok: false,
      message: null,
      prUrl: null,
    }, new FormData());

    expect((result.ok ? null : result.message)).toMatch(/GitHub token unavailable/);
    expect(result.prUrl).toBeNull();
  });

  it("requires a persisted verified patch candidate", async () => {
    getWorkspace.mockResolvedValue(workspaceFor("member"));
    listEvidenceForFinding.mockResolvedValue([]);

    const result = await createPullRequestAction(
      "f1",
      { ok: false, message: null, prUrl: null },
      new FormData(),
    );

    expect((result.ok ? null : result.message)).toMatch(/Generate and review/);
    expect(preparePullRequest).not.toHaveBeenCalled();
  });

  it("keeps prUrl when the evidence write fails, then records pull_request_prepared on retry", async () => {
    const workspace = workspaceFor("member");
    getWorkspace.mockResolvedValue(workspace);
    preparePullRequest.mockResolvedValue({
      branch: "fix/img-alt",
      prUrl: "https://github.com/acme/shop/pull/1",
      title: "fix: alt text",
      message: "Opened pull request.",
    });
    withProjectWrite
      .mockRejectedValueOnce(new Error("db write failed"))
      .mockImplementation(async (fn) => invokeProjectWriteMock(workspace, fn));

    const first = await createPullRequestAction(
      "f1",
      { ok: false, message: null, prUrl: null },
      new FormData(),
    );
    expect(first.ok).toBe(false);
    expect(first.prUrl).toBe("https://github.com/acme/shop/pull/1");
    expect(first.message).toMatch(/database write failed/i);
    expect(first.message).toMatch(/Retry/);

    const second = await createPullRequestAction("f1", first, new FormData());
    expect(second).toEqual({
      ok: true,
      message: "Opened pull request.",
      prUrl: "https://github.com/acme/shop/pull/1",
    });
    expect(
      projectWritePayload()?.evidence?.some(
        (row) => row.kind === "pull_request_prepared",
      ),
    ).toBe(true);
    // prepare may run twice; reconcile inside prepare avoids a second pulls.create.
    expect(preparePullRequest).toHaveBeenCalledTimes(2);
  });
});
