import { vi } from "vitest";

import type {
  EvidenceRecord,
  Finding,
  Remediation,
  Requirement,
} from "@complyloop/analysis-core/contract/entities";
import type { Project } from "@complyloop/analysis-core/contract/project-types";
import { PublicError } from "@complyloop/analysis-core/contract/public-error";

import { assertProjectPermission } from "@/server/workspace/project-visibility";

import type { TestWorkspace } from "./workspace";

const withProjectTx = vi.fn();
const withOrgWrite = vi.fn();
const withProjectLock = vi.fn();
const withConnectWrite = vi.fn();
const getWorkspace = vi.fn();

/** Rows the action wrote through the mocked repo layer (assertions read this). */
export interface RecordedWrites {
  findings: Finding[];
  remediations: Remediation[];
  requirements: Requirement[];
  evidence: EvidenceRecord[];
  project?: Project;
}

const writes: RecordedWrites = {
  findings: [],
  remediations: [],
  requirements: [],
  evidence: [],
};

/** Rows written by the most recent action, in write order. */
export function recordedWrites(): RecordedWrites {
  return writes;
}

export function clearRecordedWrites(): void {
  writes.findings.length = 0;
  writes.remediations.length = 0;
  writes.requirements.length = 0;
  writes.evidence.length = 0;
  delete writes.project;
}

/** Insert-or-replace by id: mirrors the repo upserts on the in-memory store. */
export function replaceById<T extends { id: string }>(
  list: T[],
  item: T,
): void {
  const index = list.findIndex((candidate) => candidate.id === item.id);
  if (index >= 0) list[index] = item;
  else list.push(item);
}

/** Fake transaction handle: the mocked repo functions ignore it. */
const tx = {} as never;

let store: TestWorkspace | null = null;

/** The in-memory "database" the mocked repo functions read and write. */
export function mockStore(): TestWorkspace | null {
  return store;
}

/**
 * Centralized `withProjectTx` stub: authorizes against the fixture workspace
 * (same matrix as production) and runs the callback with a fake transaction
 * whose repo calls hit {@link mockStore}.
 */
export function mockProjectTx(workspace: TestWorkspace): void {
  store = workspace;
  withProjectTx.mockImplementation(
    async (
      projectId: string,
      permission: Parameters<typeof assertProjectPermission>[2],
      fn: (ctx: unknown) => Promise<unknown>,
    ) => {
      const project = workspace.projects.find(
        (candidate) => candidate.id === projectId,
      );
      if (!project) throw new PublicError("Unknown project.");
      assertProjectPermission(project, workspace.access, permission);
      return fn({
        tx,
        project,
        userId: workspace.userId,
        githubLogin: workspace.githubLogin,
        actor: workspace.githubLogin ?? workspace.userId ?? undefined,
      });
    },
  );
}

export const actionWorkspaceMocks = {
  withProjectTx,
  withOrgWrite,
  withProjectLock,
  withConnectWrite,
  getWorkspace,
  replaceById,
  writes,
};

export const actionAuthMocks = {
  auth: vi.fn(),
  getGitHubAccessToken: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
};
