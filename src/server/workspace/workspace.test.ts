import { beforeEach, describe, expect, it, vi } from "vitest";

import { emptyWorkspaceSlice } from "@complyloop/db/types";

import { testMembership } from "@/test-fixtures/membership";
import { testProject } from "@/test-fixtures/project";

const auth = vi.hoisted(() => vi.fn());
const readActiveOrgCookie = vi.hoisted(() => vi.fn());
const getDrizzle = vi.hoisted(() => vi.fn());
const loadTenancyDb = vi.hoisted(() => vi.fn());
const acquireNamedPostgresAdvisoryLock = vi.hoisted(() => vi.fn());
const insertOrganization = vi.hoisted(() => vi.fn());
const upsertMembership = vi.hoisted(() => vi.fn());
const deleteMembership = vi.hoisted(() => vi.fn());
const deleteOrganizationRow = vi.hoisted(() => vi.fn());
const insertProject = vi.hoisted(() => vi.fn());
const deleteProject = vi.hoisted(() => vi.fn());
const getProjectById = vi.hoisted(() => vi.fn());
const listMembershipsForOrgs = vi.hoisted(() => vi.fn());
const insertEvidenceRecords = vi.hoisted(() => vi.fn());
const deleteEvidenceForOrg = vi.hoisted(() => vi.fn());

vi.mock("@/auth", () => ({ auth }));
vi.mock("./active-cookies", () => ({
  readActiveOrgCookie,
}));
vi.mock("@complyloop/db/postgres", () => ({
  getDrizzle,
  acquireNamedPostgresAdvisoryLock: (
    ...args: Parameters<typeof acquireNamedPostgresAdvisoryLock>
  ) => acquireNamedPostgresAdvisoryLock(...args),
  projectWriteLockKey: (projectId: string) => `project-write:${projectId}`,
  orgWriteLockKey: (userId: string) => `org-write:${userId}`,
}));
vi.mock("@complyloop/db/workspace-load", () => ({
  loadTenancyDb,
}));
vi.mock("@complyloop/db/repo/orgs", () => ({
  insertOrganization: (...args: unknown[]) => insertOrganization(...args),
  upsertMembership: (...args: unknown[]) => upsertMembership(...args),
  deleteMembership: (...args: unknown[]) => deleteMembership(...args),
  deleteOrganizationRow: (...args: unknown[]) => deleteOrganizationRow(...args),
  listMembershipsForOrgs: (...args: unknown[]) =>
    listMembershipsForOrgs(...args),
}));
vi.mock("@complyloop/db/repo/projects", () => ({
  insertProject: (...args: unknown[]) => insertProject(...args),
  deleteProject: (...args: unknown[]) => deleteProject(...args),
  getProjectById: (...args: unknown[]) => getProjectById(...args),
}));
vi.mock("@complyloop/db/repo/evidence", () => ({
  WORKSPACE_EVIDENCE_LIMIT: 100,
  insertEvidenceRecords: (...args: unknown[]) => insertEvidenceRecords(...args),
  deleteEvidenceForOrg: (...args: unknown[]) => deleteEvidenceForOrg(...args),
}));

import { withProjectLock } from "./db";
import {
  withConnectWrite,
  withOrgWrite,
  withProjectTx,
} from "./workspace-write";

const orgId = "org-1";
const userId = "user-1";
const project = testProject({ id: "p1", orgId, ownerUserId: userId });
const tx = { kind: "tx" };

describe("withProjectTx", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getDrizzle.mockResolvedValue({
      transaction: async (fn: (innerTx: typeof tx) => Promise<unknown>) =>
        fn(tx),
    });
    auth.mockResolvedValue({ user: { id: userId, login: "dev" } });
    acquireNamedPostgresAdvisoryLock.mockResolvedValue(undefined);
    getProjectById.mockResolvedValue(structuredClone(project));
    listMembershipsForOrgs.mockResolvedValue([
      testMembership("owner", { userId, orgId }),
    ]);
  });

  it("authorizes, locks the project, and hands the transaction to the callback", async () => {
    const seen: Array<{ id: string; actor: string | undefined }> = [];

    const result = await withProjectTx(
      project.id,
      "project.remediate",
      async (ctx) => {
        seen.push({ id: ctx.project.id, actor: ctx.actor });
        expect(ctx.tx).toBe(tx);
        return "done";
      },
    );

    expect(result).toBe("done");
    expect(seen).toEqual([{ id: project.id, actor: "dev" }]);
    expect(acquireNamedPostgresAdvisoryLock).toHaveBeenCalledWith(
      tx,
      `project-write:${project.id}`,
    );
  });

  it("re-reads the project inside the transaction", async () => {
    getProjectById
      .mockReset()
      .mockResolvedValueOnce(structuredClone(project))
      .mockResolvedValueOnce({ ...structuredClone(project), name: "Live" });

    const names: string[] = [];
    await withProjectTx(project.id, "project.view", async (ctx) => {
      names.push(ctx.project.name);
    });

    expect(names).toEqual(["Live"]);
    expect(getProjectById).toHaveBeenCalledTimes(2);
  });

  it("denies a role without the permission before taking the lock", async () => {
    listMembershipsForOrgs.mockResolvedValue([
      testMembership("viewer", { userId, orgId }),
    ]);

    await expect(
      withProjectTx(project.id, "project.remediate", async () => "nope"),
    ).rejects.toThrow(/Not allowed/);
    expect(acquireNamedPostgresAdvisoryLock).not.toHaveBeenCalled();
  });

  it("rejects non-members", async () => {
    listMembershipsForOrgs.mockResolvedValue([]);
    await expect(
      withProjectTx(project.id, "project.remediate", async () => "nope"),
    ).rejects.toThrow(/Not allowed/);
    expect(acquireNamedPostgresAdvisoryLock).not.toHaveBeenCalled();
  });

  it("throws for an unknown project", async () => {
    getProjectById.mockResolvedValue(undefined);
    await expect(
      withProjectTx("missing", "project.view", async () => "nope"),
    ).rejects.toThrow(/Unknown project/);
  });

  it("requires sign-in", async () => {
    auth.mockResolvedValue(null);
    await expect(
      withProjectTx(project.id, "project.view", async () => "nope"),
    ).rejects.toThrow(/Sign in to continue/);
  });
});

describe("withProjectLock", () => {
  it("locks the project and returns the callback value", async () => {
    getDrizzle.mockResolvedValue({
      transaction: async (fn: (innerTx: typeof tx) => Promise<unknown>) =>
        fn(tx),
    });
    acquireNamedPostgresAdvisoryLock.mockResolvedValue(undefined);

    await expect(
      withProjectLock("p1", async (innerTx) => ({ innerTx })),
    ).resolves.toEqual({ innerTx: tx });
    expect(acquireNamedPostgresAdvisoryLock).toHaveBeenCalledWith(
      tx,
      "project-write:p1",
    );
  });
});

describe("withOrgWrite and withConnectWrite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getDrizzle.mockResolvedValue({
      transaction: async (fn: (innerTx: typeof tx) => Promise<unknown>) =>
        fn(tx),
    });
    auth.mockResolvedValue({ user: { id: userId, login: "dev" } });
    acquireNamedPostgresAdvisoryLock.mockResolvedValue(undefined);
    loadTenancyDb.mockResolvedValue({
      ...emptyWorkspaceSlice(),
      organizations: [
        { id: orgId, name: "Acme", slug: "acme", createdAt: "2026-01-01" },
      ],
      memberships: [testMembership("owner", { userId, orgId })],
      projects: [],
    });
  });

  it("requires sign-in", async () => {
    auth.mockResolvedValue(null);
    await expect(
      withOrgWrite(async () => ({ result: "unreached" })),
    ).rejects.toThrow(/Sign in to continue/);
  });

  it("persists org inserts, upserts, and deletes, then returns the result", async () => {
    const result = await withOrgWrite(async () => ({
      result: "created",
      insertOrgs: [
        { id: "org-2", name: "Beta", slug: "beta", createdAt: "2026-01-01" },
      ],
      upsertMemberships: [testMembership("member", { userId, orgId: "org-2" })],
      deleteMembershipIds: ["m-gone"],
      deleteOrgIds: ["org-gone"],
    }));

    expect(result).toBe("created");
    expect(acquireNamedPostgresAdvisoryLock).toHaveBeenCalledWith(
      tx,
      `org-write:${userId}`,
    );
    expect(insertOrganization).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ id: "org-2" }),
    );
    expect(upsertMembership).toHaveBeenCalled();
    expect(deleteMembership).toHaveBeenCalledWith(tx, "m-gone");
    expect(deleteEvidenceForOrg).toHaveBeenCalledWith(tx, "org-gone");
    expect(deleteOrganizationRow).toHaveBeenCalledWith(tx, "org-gone");
  });

  it("persists connect inserts, deletes, and evidence", async () => {
    const connected = testProject({ id: "p9", orgId, ownerUserId: userId });
    const result = await withConnectWrite(async () => ({
      result: "connected",
      insertProjects: [connected],
      deleteProjectIds: ["p-old"],
      evidence: [
        {
          id: "ev1",
          at: "2026-01-01T00:00:00.000Z",
          kind: "project_connected",
          summary: "Connected",
          projectId: "p9",
        },
      ],
    }));

    expect(result).toBe("connected");
    expect(deleteProject).toHaveBeenCalledWith(tx, "p-old");
    expect(insertProject).toHaveBeenCalledWith(tx, connected);
    expect(insertEvidenceRecords).toHaveBeenCalledWith(
      tx,
      expect.arrayContaining([expect.objectContaining({ id: "ev1" })]),
    );
  });
});
