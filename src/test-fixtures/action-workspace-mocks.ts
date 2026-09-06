import { createProjectWriteCollector } from "@complyloop/db/project-write";
import type { Workspace } from "@/server/workspace";
import { vi } from "vitest";

const withProjectWrite = vi.fn();
const withOrgWrite = vi.fn();
const withProjectLock = vi.fn();

export function invokeProjectWriteMock<T>(
  workspace: Workspace,
  fn: (
    workspace: Workspace,
    writes: ReturnType<typeof createProjectWriteCollector>,
  ) => T,
): T {
  return fn(workspace, createProjectWriteCollector(workspace.db));
}

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
