import { beforeEach, describe, expect, it, vi } from "vitest";
import { testProject } from "@/test-fixtures/project";
import { testMembership } from "@/test-fixtures/membership";
import { emptyDb } from "@complyloop/db/types";

const auth = vi.hoisted(() => vi.fn());
const readActiveOrgCookie = vi.hoisted(() => vi.fn());
const readActiveProjectCookie = vi.hoisted(() => vi.fn());
const getDrizzle = vi.hoisted(() => vi.fn());
const loadWorkspaceDb = vi.hoisted(() => vi.fn());
const persistProjectRows = vi.hoisted(() => vi.fn());
const acquireNamedPostgresAdvisoryLock = vi.hoisted(() => vi.fn());

vi.mock("@/auth", () => ({ auth }));
vi.mock("./active-cookies", () => ({
  readActiveOrgCookie,
  readActiveProjectCookie,
}));
vi.mock("@complyloop/db/client", () => ({ getDrizzle }));
vi.mock("@complyloop/db/workspace-load", () => ({ loadWorkspaceDb }));
vi.mock("@complyloop/db/repo/apply", async () => {
  const actual = await vi.importActual<typeof import("@complyloop/db/repo/apply")>(
    "@complyloop/db/repo/apply",
  );
  return {
    ...actual,
    persistProjectRows: (...args: unknown[]) => persistProjectRows(...args),
  };
});
vi.mock("@complyloop/db/write-lock", () => ({
  acquireNamedPostgresAdvisoryLock: (
    ...args: Parameters<typeof acquireNamedPostgresAdvisoryLock>
  ) => acquireNamedPostgresAdvisoryLock(...args),
  projectWriteLockKey: (projectId: string) => `project-write:${projectId}`,
}));

import { withProjectWrite } from "./workspace-write";

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
    persistProjectRows.mockResolvedValue(undefined);
    acquireNamedPostgresAdvisoryLock.mockResolvedValue(undefined);
  });

  it("persists the payload the handler returns", async () => {
    const value = await withProjectWrite({ touch: "project" }, async (workspace) => {
      const active = workspace.project!;
      active.runtimeBaseUrl = "https://preview.example";
      active.runtimeRoutes = ["/"];
      return {
        result: "saved",
        payload: { project: active },
      };
    });

    expect(value).toBe("saved");
    expect(acquireNamedPostgresAdvisoryLock).toHaveBeenCalledWith(
      tx,
      `project-write:${project.id}`,
    );
    expect(persistProjectRows).toHaveBeenCalledWith(
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

  it("sets payload.project when the handler mutates the project but omits it", async () => {
    await withProjectWrite({ touch: "project" }, async (workspace) => {
      workspace.project!.runtimeBaseUrl = "https://preview.example";
      return { result: undefined, payload: {} };
    });

    expect(persistProjectRows).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        project: expect.objectContaining({
          runtimeBaseUrl: "https://preview.example",
        }),
      }),
      {},
    );
  });

  it("skips project update when the payload is empty and the project is unchanged", async () => {
    await withProjectWrite({ touch: "project" }, async () => ({
      result: undefined,
      payload: {},
    }));

    expect(persistProjectRows).toHaveBeenCalledWith(tx, {}, {});
  });
});
