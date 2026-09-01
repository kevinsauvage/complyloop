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
    withWorkspaceWrite: (fn: Parameters<typeof actual.withWorkspaceWrite>[0]) =>
      actionWorkspaceMocks.withWorkspaceWrite(fn),
  };
});
