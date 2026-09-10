import { vi } from "vitest";
import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import { actionAuthMocks, actionWorkspaceMocks } from "./action-workspace-mocks";
import type { Finding, Remediation } from "@complyloop/db/types";
import type { ProjectWriteWorkspace } from "@/server/workspace";
import { requireOnFindingProject } from "@/server/actions/shared";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/auth", () => ({
  auth: actionAuthMocks.auth,
  getGitHubAccessToken: actionAuthMocks.getGitHubAccessToken,
  isGitHubAuthConfigured: () => false,
  signIn: actionAuthMocks.signIn,
  signOut: actionAuthMocks.signOut,
}));

vi.mock("@/server/workspace", async () => {
  const actual = await vi.importActual<typeof import("@/server/workspace")>(
    "@/server/workspace",
  );

  type WriteSlice = {
    db?: { findings: Finding[]; remediations: Remediation[] };
  };

  return {
    ...actual,
    getWorkspace: () => actionWorkspaceMocks.getWorkspace(),
    requireFinding: async (findingId: string) => {
      const workspace = (await actionWorkspaceMocks.getWorkspace()) as WriteSlice;
      const finding = workspace.db?.findings.find((row) => row.id === findingId);
      if (!finding) throw new PublicError("Unknown finding.");
      return finding;
    },
    requireRemediationForFinding: async (findingId: string) => {
      const workspace = (await actionWorkspaceMocks.getWorkspace()) as WriteSlice;
      const remediation = workspace.db?.remediations.find(
        (row) => row.findingId === findingId,
      );
      if (!remediation) throw new PublicError("No remediation for that finding.");
      return remediation;
    },
  };
});

vi.mock("@/server/workspace-write", async () => {
  const actual = await vi.importActual<typeof import("@/server/workspace-write")>(
    "@/server/workspace-write",
  );
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
    withProjectLock: (
      projectId: Parameters<typeof actual.withProjectLock>[0],
      fn: Parameters<typeof actual.withProjectLock>[1],
    ) => actionWorkspaceMocks.withProjectLock(projectId, fn),
    withConnectWrite: (
      options: Parameters<typeof actual.withConnectWrite>[0],
      fn: Parameters<typeof actual.withConnectWrite>[1],
    ) => actionWorkspaceMocks.withConnectWrite(options, fn),
  };
});
