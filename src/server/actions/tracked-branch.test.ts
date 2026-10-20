import "@/test-fixtures/register-action-workspace-mock";
import "@/test-fixtures/register-repo-mock";

import { afterEach, describe, expect, it, vi } from "vitest";

import { PublicError } from "@complyloop/analysis-core/contract/public-error";

import { initialActionState } from "@/core/actions/action-state";
import {
  actionWorkspaceMocks,
  clearRecordedWrites,
  mockProjectTx,
  recordedWrites,
} from "@/test-fixtures/action-workspace-mocks";
import { testProject } from "@/test-fixtures/project";
import { testWorkspace } from "@/test-fixtures/workspace";

import { updateTrackedBranchAction } from "./tracked-branch";

const { getWorkspace, withProjectTx } = actionWorkspaceMocks;
const assertBranchExists = vi.hoisted(() => vi.fn());
const resolveProjectGitHubToken = vi.hoisted(() => vi.fn());
const assertRuntimeAuditRateLimit = vi.hoisted(() => vi.fn());

vi.mock("../github/github-access", () => ({
  assertBranchExists: (...args: unknown[]) => assertBranchExists(...args),
  resolveProjectGitHubToken: (...args: unknown[]) =>
    resolveProjectGitHubToken(...args),
}));

vi.mock("../rate-limit", async () => {
  const actual =
    await vi.importActual<typeof import("../rate-limit")>("../rate-limit");
  return {
    ...actual,
    assertRuntimeAuditRateLimit: (...args: unknown[]) =>
      assertRuntimeAuditRateLimit(...args),
  };
});

vi.mock("./shared", async () => {
  const actual = await vi.importActual<typeof import("./shared")>("./shared");
  return { ...actual, refresh: () => undefined };
});

const project = testProject({
  orgId: "org-1",
  github: { fullName: "acme/shop", defaultBranch: "main", private: false },
});

function workspaceFor(role: "viewer" | "member" | "admin" | "owner") {
  return testWorkspace({ role, project });
}

function formWith(branch: string): FormData {
  const form = new FormData();
  form.set("trackedBranch", branch);
  return form;
}

afterEach(() => {
  clearRecordedWrites();
  vi.clearAllMocks();
});

describe("updateTrackedBranchAction", () => {
  it("denies members who cannot connect", async () => {
    const workspace = workspaceFor("member");
    getWorkspace.mockResolvedValue(workspace);
    mockProjectTx(workspace);

    const result = await updateTrackedBranchAction(
      initialActionState,
      formWith("develop"),
    );

    expect(result.ok ? null : result.message).toMatch(/Not allowed/);
    expect(assertBranchExists).not.toHaveBeenCalled();
  });

  it("saves an existing branch after verifying it on GitHub", async () => {
    const workspace = workspaceFor("owner");
    getWorkspace.mockResolvedValue(workspace);
    mockProjectTx(workspace);
    resolveProjectGitHubToken.mockResolvedValue("token");
    assertBranchExists.mockResolvedValue(undefined);

    const result = await updateTrackedBranchAction(
      initialActionState,
      formWith("  develop  "),
    );

    expect(result.message).toMatch(/Tracking branch "develop"/);
    expect(assertBranchExists).toHaveBeenCalledWith(
      "token",
      "acme/shop",
      "develop",
    );
    expect(recordedWrites()?.project?.github?.trackedBranch).toBe("develop");
  });

  it("rejects a branch GitHub does not have, without writing", async () => {
    const workspace = workspaceFor("owner");
    getWorkspace.mockResolvedValue(workspace);
    resolveProjectGitHubToken.mockResolvedValue("token");
    assertBranchExists.mockRejectedValue(
      new PublicError('Branch "nope" does not exist in acme/shop.'),
    );

    const result = await updateTrackedBranchAction(
      initialActionState,
      formWith("nope"),
    );

    expect(result.ok ? null : result.message).toMatch(/does not exist/);
    expect(withProjectTx).not.toHaveBeenCalled();
  });

  it("rejects a malformed ref before touching GitHub", async () => {
    const workspace = workspaceFor("owner");
    getWorkspace.mockResolvedValue(workspace);

    const result = await updateTrackedBranchAction(
      initialActionState,
      formWith("--upload-pack=evil"),
    );

    expect(result.ok ? null : result.message).toMatch(/Invalid checkout ref/);
    expect(assertBranchExists).not.toHaveBeenCalled();
    expect(withProjectTx).not.toHaveBeenCalled();
  });

  it("clears the tracked branch when the field is empty", async () => {
    const workspace = workspaceFor("owner");
    workspace.project!.github!.trackedBranch = "develop";
    mockProjectTx(workspace);

    const result = await updateTrackedBranchAction(
      initialActionState,
      formWith("  "),
    );

    expect(result.message).toMatch(/default branch/);
    expect(recordedWrites()?.project?.github?.trackedBranch).toBeUndefined();
    expect(assertBranchExists).not.toHaveBeenCalled();
  });
});
