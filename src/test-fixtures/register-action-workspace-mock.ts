import { vi } from "vitest";
import { actionAuthMocks } from "./action-workspace-mocks";

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
  const { actionWorkspaceMocks } = await import(
    "@/test-fixtures/action-workspace-mocks"
  );
  return {
    ...actual,
    getWorkspace: () => actionWorkspaceMocks.getWorkspace(),
    withProjectWrite: (fn: Parameters<typeof actual.withProjectWrite>[0]) =>
      actionWorkspaceMocks.withProjectWrite(fn),
    withTargetedProjectWrite: (
      scope: Parameters<typeof actual.withTargetedProjectWrite>[0],
      fn: Parameters<typeof actual.withTargetedProjectWrite>[1],
    ) => actionWorkspaceMocks.withTargetedProjectWrite(scope, fn),
    withOrgWrite: (fn: Parameters<typeof actual.withOrgWrite>[0]) =>
      actionWorkspaceMocks.withOrgWrite(fn),
  };
});
