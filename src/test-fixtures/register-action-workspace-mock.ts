/* eslint-disable simple-import-sort/imports --
 * Import order is load-bearing here: `vi.mock` factories below reference
 * `actionAuthMocks` / `actionWorkspaceMocks`, and Vitest hoists `vi.mock`
 * above imports. The mock-state module must initialise before any import
 * that (transitively) pulls a mocked specifier (`@/auth`,
 * `@/server/github/access-token`, `@/server/workspace`, …), so it stays first. Do not re-sort. */
import { vi } from "vitest";
import {
  actionAuthMocks,
  actionWorkspaceMocks,
} from "./action-workspace-mocks";

import type {
  Finding,
  Remediation,
} from "@complyloop/analysis-core/contract/entities";
import { PublicError } from "@complyloop/analysis-core/contract/public-error";

import { requireOnFindingProject } from "@/server/workspace/project-visibility";
import type { Permission } from "@/core/rbac";
import type { ProjectWriteWorkspace } from "@/server/workspace/workspace";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/auth", () => ({
  auth: actionAuthMocks.auth,
  isGitHubAuthConfigured: () => false,
  signIn: actionAuthMocks.signIn,
  signOut: actionAuthMocks.signOut,
}));

vi.mock("@/server/github/access-token", () => ({
  getGitHubAccessToken: actionAuthMocks.getGitHubAccessToken,
  // Derived from the same stub: string → valid, null → missing. Tests that
  // need the revoked state stub `getGitHubAccessTokenState` directly.
  getGitHubAccessTokenState: async () => {
    const token: string | null =
      await actionAuthMocks.getGitHubAccessToken();
    return token ? { state: "valid", token } : { state: "missing" };
  },
}));

vi.mock("@/server/workspace/workspace", async () => {
  const actual = await vi.importActual<
    typeof import("@/server/workspace/workspace")
  >("@/server/workspace/workspace");

  type WriteSlice = {
    db?: { findings: Finding[]; remediations: Remediation[] };
  };

  return {
    ...actual,
    getWorkspace: () => actionWorkspaceMocks.getWorkspace(),
    requireFinding: async (findingId: string) => {
      const workspace =
        (await actionWorkspaceMocks.getWorkspace()) as WriteSlice;
      const finding = workspace.db?.findings.find(
        (row) => row.id === findingId,
      );
      if (!finding) throw new PublicError("Unknown finding.");
      return finding;
    },
    requireRemediationForFinding: async (findingId: string) => {
      const workspace =
        (await actionWorkspaceMocks.getWorkspace()) as WriteSlice;
      const remediation = workspace.db?.remediations.find(
        (row) => row.findingId === findingId,
      );
      if (!remediation)
        throw new PublicError("No remediation for that finding.");
      return remediation;
    },
    requireProjectAccess: async (projectId: string, permission: Permission) => {
      const workspace =
        (await actionWorkspaceMocks.getWorkspace()) as WriteSlice & {
          projects: Array<{ id: string }>;
        };
      const project = workspace.projects.find((row) => row.id === projectId);
      if (!project) throw new PublicError("Unknown project.");
      requireOnFindingProject(
        workspace as Parameters<typeof requireOnFindingProject>[0],
        { projectId } as Finding,
        permission,
      );
      return project;
    },
  };
});

vi.mock("@/server/workspace/workspace-write", async () => {
  const actual = await vi.importActual<
    typeof import("@/server/workspace/workspace-write")
  >("@/server/workspace/workspace-write");
  return {
    ...actual,
    withProjectWrite: (fn: Parameters<typeof actual.withProjectWrite>[0]) =>
      actionWorkspaceMocks.withProjectWrite(fn),
    withFindingWrite: (
      findingId: string,
      permission: Parameters<typeof actual.withFindingWrite>[1],
      fn: Parameters<typeof actual.withFindingWrite>[2],
    ) =>
      actionWorkspaceMocks.withProjectWrite(
        (workspace: ProjectWriteWorkspace) => {
          const finding = workspace.db.findings.find(
            (row) => row.id === findingId,
          );
          if (!finding) throw new PublicError("Unknown finding.");
          requireOnFindingProject(workspace, finding, permission);
          return fn({ db: workspace.db, finding, workspace });
        },
      ),
    withOrgWrite: (fn: Parameters<typeof actual.withOrgWrite>[0]) =>
      actionWorkspaceMocks.withOrgWrite(fn),
    withConnectWrite: (
      options: Parameters<typeof actual.withConnectWrite>[0],
      fn: Parameters<typeof actual.withConnectWrite>[1],
    ) => actionWorkspaceMocks.withConnectWrite(options, fn),
  };
});

vi.mock("@/server/workspace/db", async () => {
  const actual = await vi.importActual<
    typeof import("@/server/workspace/db")
  >("@/server/workspace/db");
  return {
    ...actual,
    withProjectLock: (
      projectId: Parameters<typeof actual.withProjectLock>[0],
      fn: Parameters<typeof actual.withProjectLock>[1],
    ) => actionWorkspaceMocks.withProjectLock(projectId, fn),
  };
});
