import type { ProjectWritePayload } from "@complyloop/db/repo/apply";
import type { Workspace } from "@/server/workspace";
import { vi } from "vitest";

const withProjectWrite = vi.fn();
const withOrgWrite = vi.fn();
const withProjectLock = vi.fn();

function replaceInArray<T extends { id: string }>(items: T[], updated: T): void {
  const index = items.findIndex((candidate) => candidate.id === updated.id);
  if (index >= 0) {
    items[index] = updated;
    return;
  }
  items.push(updated);
}

export async function invokeProjectWriteMock<T>(
  workspace: Workspace,
  fn: (
    workspace: Workspace,
  ) =>
    | Promise<{ result: T; payload: ProjectWritePayload }>
    | { result: T; payload: ProjectWritePayload },
): Promise<T> {
  const { result, payload } = await fn(workspace);
  for (const finding of payload.findings ?? []) {
    replaceInArray(workspace.db.findings, finding);
  }
  for (const remediation of payload.remediations ?? []) {
    replaceInArray(workspace.db.remediations, remediation);
  }
  for (const requirement of payload.requirements ?? []) {
    replaceInArray(workspace.db.requirements, requirement);
  }
  workspace.db.evidence.push(...(payload.evidence ?? []));
  if (payload.project) {
    replaceInArray(workspace.db.projects, payload.project);
    workspace.project = payload.project;
  }
  return result;
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
