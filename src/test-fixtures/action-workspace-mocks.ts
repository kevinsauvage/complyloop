import { vi } from "vitest";

const withProjectWrite = vi.fn();
const withTargetedProjectWrite = vi.fn();
const withOrgWrite = vi.fn();

export const actionWorkspaceMocks = {
  withProjectWrite,
  withTargetedProjectWrite,
  withOrgWrite,
  getWorkspace: vi.fn(),
};

export const actionAuthMocks = {
  auth: vi.fn(),
  getGitHubAccessToken: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
};
