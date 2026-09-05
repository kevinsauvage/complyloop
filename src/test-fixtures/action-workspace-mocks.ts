import { vi } from "vitest";

const withProjectRowWrite = vi.fn();
const withTargetedProjectWrite = vi.fn();
const withOrgWrite = vi.fn();
const withProjectLock = vi.fn();

export const actionWorkspaceMocks = {
  withProjectRowWrite,
  withTargetedProjectWrite,
  withOrgWrite,
  withProjectLock,
  getWorkspace: vi.fn(),
};

export const actionAuthMocks = {
  auth: vi.fn(),
  getGitHubAccessToken: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
};
