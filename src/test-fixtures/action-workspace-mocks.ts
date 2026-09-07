import type { ProjectWritePayload } from "@complyloop/db/repo/apply";
import type { Workspace } from "@/server/workspace";
import { vi } from "vitest";

const withProjectWrite = vi.fn();
const withOrgWrite = vi.fn();
const withProjectLock = vi.fn();

const capturedPayloads: ProjectWritePayload[] = [];

/**
 * Runs the write callback and captures the payload it produces, WITHOUT
 * applying it back to the workspace. Actions clone onto the payload and never
 * mutate the loaded Db, so tests assert on the captured payload directly.
 */
export async function invokeProjectWriteMock<T>(
  workspace: Workspace,
  fn: (
    workspace: Workspace,
  ) =>
    | Promise<{ result: T; payload: ProjectWritePayload }>
    | { result: T; payload: ProjectWritePayload },
): Promise<T> {
  const { result, payload } = await fn(workspace);
  capturedPayloads.push(payload);
  return result;
}

/** Payload captured by the most recent `invokeProjectWriteMock` call. */
export function projectWritePayload(): ProjectWritePayload | undefined {
  return capturedPayloads.at(-1);
}

/** Payloads captured across `invokeProjectWriteMock` calls (cleared per test). */
export function projectWritePayloads(): ProjectWritePayload[] {
  return capturedPayloads;
}

export function clearProjectWritePayloads(): void {
  capturedPayloads.length = 0;
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