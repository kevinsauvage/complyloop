import { beforeEach, describe, expect, it, vi } from "vitest";
import { testProject } from "@/test-fixtures/project";
import { testMembership } from "@/test-fixtures/membership";
import { emptyDb } from "@complyloop/db/types";

const auth = vi.hoisted(() => vi.fn());
const readActiveOrgCookie = vi.hoisted(() => vi.fn());
const readActiveProjectCookie = vi.hoisted(() => vi.fn());
const getDrizzle = vi.hoisted(() => vi.fn());
const loadWorkspaceDb = vi.hoisted(() => vi.fn());
const persistProjectWrite = vi.hoisted(() => vi.fn());
const acquireNamedPostgresAdvisoryLock = vi.hoisted(() => vi.fn());

vi.mock("@/auth", () => ({ auth }));
vi.mock("./active-cookies", () => ({
  readActiveOrgCookie,
  readActiveProjectCookie,
}));
vi.mock("@complyloop/db/client", () => ({ getDrizzle }));
vi.mock("@complyloop/db/workspace-load", () => ({ loadWorkspaceDb }));
vi.mock("@complyloop/db/project-write", async () => {
  const actual = await vi.importActual<typeof import("@complyloop/db/project-write")>(
    "@complyloop/db/project-write",
  );
  return {
    ...actual,
    persistProjectWrite: (...args: unknown[]) => persistProjectWrite(...args),
  };
});
vi.mock("@complyloop/db/write-lock", () => ({
  acquireNamedPostgresAdvisoryLock: (
    ...args: Parameters<typeof acquireNamedPostgresAdvisoryLock>
  ) => acquireNamedPostgresAdvisoryLock(...args),
  projectWriteLockKey: (projectId: string) => `project-write:${projectId}`,
}));

import { withProjectWrite } from "./workspace";

describe("withProjectWrite project touch", () => {
  const orgId = "org-1";
  const userId = "user-1";
  const project = testProject({ orgId, ownerUserId: userId });
  const tx = { kind: "tx" };

  beforeEach(() => {
    vi.clearAllMocks();
    getDrizzle.mockResolvedValue({
      transaction: async (fn: (innerTx: typeof tx) => Promise<unknown>) =>
        fn(tx),
    });
    auth.mockResolvedValue({ user: { id: userId, login: "dev" } });
    readActiveOrgCookie.mockResolvedValue(orgId);
    readActiveProjectCookie.mockResolvedValue(project.id);
    loadWorkspaceDb.mockResolvedValue({
      ...emptyDb(),
      organizations: [
        { id: orgId, name: "Acme", slug: "acme", createdAt: "2026-01-01" },
      ],
      memberships: [testMembership("owner", { userId, orgId })],
      projects: [structuredClone(project)],
    });
    persistProjectWrite.mockResolvedValue(undefined);
    acquireNamedPostgresAdvisoryLock.mockResolvedValue(undefined);
  });

  it("persists active project row changes", async () => {
    await withProjectWrite({ touch: "project" }, async (workspace, writes) => {
      workspace.project!.runtimeBaseUrl = "https://preview.example";
      workspace.project!.runtimeRoutes = ["/"];
      writes.setProject(workspace.project!);
    });

    expect(acquireNamedPostgresAdvisoryLock).toHaveBeenCalledWith(
      tx,
      `project-write:${project.id}`,
    );
    expect(persistProjectWrite).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        project: expect.objectContaining({
          id: project.id,
          runtimeBaseUrl: "https://preview.example",
          runtimeRoutes: ["/"],
        }),
      }),
      {},
    );
  });

  it("skips project update when only runtime slice rows change", async () => {
    await withProjectWrite({ touch: "project" }, async () => {
      /* no project mutation */
    });

    expect(persistProjectWrite).toHaveBeenCalledWith(tx, {}, {});
  });
});
