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
  clearRecordedWrites,
  mockStore,
} from "./action-workspace-mocks";

import { PublicError } from "@complyloop/analysis-core/contract/public-error";

import type { TestWorkspace } from "./workspace";

import { assertProjectPermission } from "@/server/workspace/project-visibility";
import type { Permission } from "@/core/rbac";

/**
 * Request-scoped read source: `getWorkspace` when a test provides one (pages /
 * preview guards), else the in-memory transaction store. Keeping the two
 * distinct is what lets a test simulate drift between the pre-lock preview and
 * the row re-read inside the transaction.
 */
async function readSource(): Promise<TestWorkspace | null> {
  const fromWorkspace =
    (await actionWorkspaceMocks.getWorkspace()) as TestWorkspace | null;
  return fromWorkspace ?? mockStore();
}

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
    const token: string | null = await actionAuthMocks.getGitHubAccessToken();
    return token ? { state: "valid", token } : { state: "missing" };
  },
}));

vi.mock("@/server/workspace/workspace", async () => {
  const actual = await vi.importActual<
    typeof import("@/server/workspace/workspace")
  >("@/server/workspace/workspace");

  return {
    ...actual,
    getWorkspace: () => actionWorkspaceMocks.getWorkspace(),
    // Store-backed when a fixture workspace is installed; otherwise the real
    // guard runs against the test's own repo mocks.
    requireFinding: async (findingId: string) => {
      const store = await readSource();
      if (!store) return actual.requireFinding(findingId);
      const finding = store.db.findings.find((row) => row.id === findingId);
      if (!finding) throw new PublicError("Unknown finding.");
      return finding;
    },
    requireRemediationForFinding: async (findingId: string) => {
      const store = await readSource();
      if (!store) return actual.requireRemediationForFinding(findingId);
      const remediation = store.db.remediations.find(
        (row) => row.findingId === findingId,
      );
      if (!remediation)
        throw new PublicError("No remediation for that finding.");
      return remediation;
    },
    requireProjectAccess: async (projectId: string, permission: Permission) => {
      // Write-model tests get the in-memory store; lighter tests (alerts,
      // polling) provide a workspace through `getWorkspace`.
      const workspace = await readSource();
      if (!workspace) throw new PublicError("Unknown project.");
      const project = workspace.projects.find((row) => row.id === projectId);
      if (!project) throw new PublicError("Unknown project.");
      assertProjectPermission(project, workspace.access, permission);
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
    withProjectTx: (
      projectId: string,
      permission: Permission,
      fn: (ctx: unknown) => Promise<unknown>,
    ) => actionWorkspaceMocks.withProjectTx(projectId, permission, fn),
    resolveActiveProjectId: () => actionWorkspaceMocks.resolveActiveProjectId(),
    withOrgWrite: (fn: Parameters<typeof actual.withOrgWrite>[0]) =>
      actionWorkspaceMocks.withOrgWrite(fn),
    withConnectWrite: (
      options: Parameters<typeof actual.withConnectWrite>[0],
      fn: Parameters<typeof actual.withConnectWrite>[1],
    ) => actionWorkspaceMocks.withConnectWrite(options, fn),
  };
});

vi.mock("@/server/workspace/db", async () => {
  const actual = await vi.importActual<typeof import("@/server/workspace/db")>(
    "@/server/workspace/db",
  );
  return {
    ...actual,
    withProjectLock: (
      projectId: Parameters<typeof actual.withProjectLock>[0],
      fn: Parameters<typeof actual.withProjectLock>[1],
    ) => actionWorkspaceMocks.withProjectLock(projectId, fn),
  };
});

export { clearRecordedWrites };
