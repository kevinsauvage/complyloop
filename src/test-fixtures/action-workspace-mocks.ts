import { vi } from "vitest";

export const actionWorkspaceMocks = {
  withWorkspaceWrite: vi.fn(),
  getWorkspace: vi.fn(),
};

export const actionAuthMocks = {
  auth: vi.fn(),
  getGitHubAccessToken: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
};
