import { vi } from "vitest";

const withProjectWrite = vi.fn();
const withOrgWrite = vi.fn();
const withProjectLock = vi.fn();

export const actionWorkspaceMocks = {
  withProjectWrite,
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
