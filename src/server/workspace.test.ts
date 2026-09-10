import { beforeEach, describe, expect, it, vi } from "vitest";
import { testFinding } from "@/test-fixtures/finding";
import { testProject } from "@/test-fixtures/project";
import { testMembership } from "@/test-fixtures/membership";
import { emptyDb } from "@complyloop/db/types";
import { PublicError } from "@complyloop/analysis-core/contract/public-error";

const auth = vi.hoisted(() => vi.fn());
const readActiveOrgCookie = vi.hoisted(() => vi.fn());
const readActiveProjectCookie = vi.hoisted(() => vi.fn());
const getDrizzle = vi.hoisted(() => vi.fn());
const loadTenancyDb = vi.hoisted(() => vi.fn());
const loadTargetedProjectWriteDb = vi.hoisted(() => vi.fn());
const persistProjectRows = vi.hoisted(() => vi.fn());
const acquireNamedPostgresAdvisoryLock = vi.hoisted(() => vi.fn());
const insertOrganization = vi.hoisted(() => vi.fn());
const upsertMembership = vi.hoisted(() => vi.fn());
const deleteMembership = vi.hoisted(() => vi.fn());
const deleteOrganizationRow = vi.hoisted(() => vi.fn());
const insertProject = vi.hoisted(() => vi.fn());
const deleteProject = vi.hoisted(() => vi.fn());
const insertEvidenceRecords = vi.hoisted(() => vi.fn());

vi.mock("@/auth", () => ({ auth }));
vi.mock("./active-cookies", () => ({
  readActiveOrgCookie,
  readActiveProjectCookie,
}));
vi.mock("@complyloop/db/client", () => ({ getDrizzle }));
vi.mock("@complyloop/db/workspace-load", () => ({
  loadTenancyDb,
  loadTargetedProjectWriteDb: (...args: unknown[]) =>
    loadTargetedProjectWriteDb(...args),
}));
vi.mock("@complyloop/db/repo/apply", async () => {
  const actual = await vi.importActual<typeof import("@complyloop/db/repo/apply")>(
    "@complyloop/db/repo/apply",
  );
  return {
    ...actual,
    persistProjectRows: (...args: unknown[]) => persistProjectRows(...args),
  };
});
vi.mock("@complyloop/db/repo/orgs", () => ({
  insertOrganization: (...args: unknown[]) => insertOrganization(...args),
  upsertMembership: (...args: unknown[]) => upsertMembership(...args),
  deleteMembership: (...args: unknown[]) => deleteMembership(...args),
  deleteOrganizationRow: (...args: unknown[]) => deleteOrganizationRow(...args),
}));
vi.mock("@complyloop/db/repo/projects", () => ({
  insertProject: (...args: unknown[]) => insertProject(...args),
  deleteProject: (...args: unknown[]) => deleteProject(...args),
}));
vi.mock("@complyloop/db/repo/evidence", () => ({
  WORKSPACE_EVIDENCE_LIMIT: 100,
  insertEvidenceRecords: (...args: unknown[]) => insertEvidenceRecords(...args),
}));
vi.mock("@complyloop/db/write-lock", () => ({
  acquireNamedPostgresAdvisoryLock: (
    ...args: Parameters<typeof acquireNamedPostgresAdvisoryLock>
  ) => acquireNamedPostgresAdvisoryLock(...args),
  projectWriteLockKey: (projectId: string) => `project-write:${projectId}`,
  orgWriteLockKey: (userId: string) => `org-write:${userId}`,
}));

import {
  withConnectWrite,
  withFindingWrite,
  withOrgWrite,
  withProjectLock,
  withProjectWrite,
} from "./workspace-write";

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
    loadTenancyDb.mockResolvedValue({
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
    await withProjectWrite({ touch: "project" }, async (workspace) => {
      const active = workspace.project!;
      active.runtimeBaseUrl = "https://preview.example";
      active.runtimeRoutes = ["/"];
      return { project: active };
    });

    expect(loadTenancyDb).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        userId,
        activeProjectId: project.id,
      }),
    );
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

  it("requires the handler to return payload.project for project changes", async () => {
    await withProjectWrite({ touch: "project" }, async (workspace) => {
      workspace.project!.runtimeBaseUrl = "https://preview.example";
      return {};
    });

    // No JSON-diff auto-persist: a handler that mutates the workspace project
    // without putting it back on the payload discards the mutation.
    expect(persistProjectRows).toHaveBeenCalledWith(tx, {}, {});
  });

  it("skips project update when the payload is empty and the project is unchanged", async () => {
    await withProjectWrite({ touch: "project" }, async () => ({}));

    expect(persistProjectRows).toHaveBeenCalledWith(tx, {}, {});
  });
});

describe("withProjectWrite entities touch", () => {
  const orgId = "org-1";
  const userId = "user-1";
  const project = testProject({ id: "p1", orgId, ownerUserId: userId });
  const tx = { kind: "tx" };

  function dbWithFinding() {
    return {
      ...emptyDb(),
      organizations: [
        { id: orgId, name: "Acme", slug: "acme", createdAt: "2026-01-01" },
      ],
      memberships: [testMembership("owner", { userId, orgId })],
      projects: [structuredClone(project)],
      findings: [testFinding({ id: "f1", projectId: "p1" })],
      remediations: [],
      requirements: [
        {
          id: "r1",
          projectId: "p1",
          controlId: "ctl-img-alt",
          status: "passed",
          determination: "automated",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    getDrizzle.mockResolvedValue({
      transaction: async (fn: (innerTx: typeof tx) => Promise<unknown>) =>
        fn(tx),
    });
    auth.mockResolvedValue({ user: { id: userId, login: "dev" } });
    readActiveOrgCookie.mockResolvedValue(orgId);
    readActiveProjectCookie.mockResolvedValue(project.id);
    acquireNamedPostgresAdvisoryLock.mockResolvedValue(undefined);
    persistProjectRows.mockResolvedValue(undefined);
  });

  it("rejects an entities scope without entity ids", async () => {
    await expect(
      withProjectWrite({ touch: "entities" }, async () => ({})),
    ).rejects.toBeInstanceOf(PublicError);
    expect(persistProjectRows).not.toHaveBeenCalled();
  });

  it("loads the scoped rows and persists with a loaded slice", async () => {
    loadTargetedProjectWriteDb.mockResolvedValue(dbWithFinding());

    await withProjectWrite({ touch: "entities", findingIds: ["f1"] }, async () => ({}));

    expect(loadTargetedProjectWriteDb).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ findingIds: ["f1"] }),
    );
    expect(persistProjectRows).toHaveBeenCalledWith(
      tx,
      {},
      expect.objectContaining({
        loadedSlice: expect.objectContaining({
          findings: [expect.objectContaining({ id: "f1" })],
          // The finding's control is derived for the requirement refresh.
          requirements: [expect.objectContaining({ id: "r1" })],
        }),
      }),
    );
  });

  it("derives refresh controls from requirements and explicit ids", async () => {
    const db = dbWithFinding();
    db.requirements.push({
      id: "r2",
      projectId: "p1",
      controlId: "ctl-other",
      status: "passed",
      determination: "automated",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    loadTargetedProjectWriteDb.mockResolvedValue(db);

    await withProjectWrite(
      {
        touch: "entities",
        requirementIds: ["r2"],
        refreshControlIds: ["ctl-explicit"],
      },
      async () => ({}),
    );

    expect(persistProjectRows).toHaveBeenCalledWith(
      tx,
      {},
      expect.objectContaining({
        loadedSlice: expect.objectContaining({
          requirements: [expect.objectContaining({ id: "r2" })],
        }),
      }),
    );
  });

  it("re-locks and reloads when the cookie project differs", async () => {
    loadTargetedProjectWriteDb.mockResolvedValue(dbWithFinding());
    readActiveProjectCookie.mockResolvedValue("stale-cookie-id");

    await withProjectWrite({ touch: "entities", findingIds: ["f1"] }, async () => ({}));

    expect(acquireNamedPostgresAdvisoryLock).toHaveBeenCalledWith(
      tx,
      "project-write:stale-cookie-id",
    );
    expect(acquireNamedPostgresAdvisoryLock).toHaveBeenCalledWith(
      tx,
      `project-write:${project.id}`,
    );
    expect(loadTargetedProjectWriteDb).toHaveBeenCalledTimes(2);
    expect(persistProjectRows).toHaveBeenCalled();
  });

  it("throws when no project resolves", async () => {
    loadTargetedProjectWriteDb.mockResolvedValue({
      ...emptyDb(),
      organizations: [],
      memberships: [],
      projects: [],
    });

    await expect(
      withProjectWrite({ touch: "entities", findingIds: ["f1"] }, async () => ({})),
    ).rejects.toThrow(/Select a project first/);
    expect(persistProjectRows).not.toHaveBeenCalled();
  });
});

describe("withFindingWrite", () => {
  const orgId = "org-1";
  const userId = "user-1";
  const project = testProject({ id: "p1", orgId, ownerUserId: userId });
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
    acquireNamedPostgresAdvisoryLock.mockResolvedValue(undefined);
    persistProjectRows.mockResolvedValue(undefined);
    loadTargetedProjectWriteDb.mockResolvedValue({
      ...emptyDb(),
      organizations: [
        { id: orgId, name: "Acme", slug: "acme", createdAt: "2026-01-01" },
      ],
      memberships: [testMembership("owner", { userId, orgId })],
      projects: [structuredClone(project)],
      findings: [testFinding({ id: "f1", projectId: "p1" })],
      remediations: [],
      requirements: [],
    });
  });

  it("hands the finding to the callback after permission checks", async () => {
    const seen: string[] = [];
    await withFindingWrite("f1", "project.remediate", async ({ finding }) => {
      seen.push(finding.id);
    });
    expect(seen).toEqual(["f1"]);
    expect(persistProjectRows).toHaveBeenCalled();
  });

  it("throws for an unknown finding", async () => {
    await expect(
      withFindingWrite("missing", "project.remediate", async () => ({})),
    ).rejects.toThrow(/Unknown finding/);
  });

  it("denies viewers the remediate permission", async () => {
    loadTargetedProjectWriteDb.mockResolvedValue({
      ...emptyDb(),
      organizations: [
        { id: orgId, name: "Acme", slug: "acme", createdAt: "2026-01-01" },
      ],
      memberships: [testMembership("viewer", { userId, orgId })],
      projects: [structuredClone(project)],
      findings: [testFinding({ id: "f1", projectId: "p1" })],
      remediations: [],
      requirements: [],
    });
    await expect(
      withFindingWrite("f1", "project.remediate", async () => ({})),
    ).rejects.toThrow(/Not allowed/);
  });
});

describe("withProjectLock", () => {
  it("locks the project and returns the callback value", async () => {
    const tx = { kind: "tx" };
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
  const orgId = "org-1";
  const userId = "user-1";
  const tx = { kind: "tx" };

  beforeEach(() => {
    vi.clearAllMocks();
    getDrizzle.mockResolvedValue({
      transaction: async (fn: (innerTx: typeof tx) => Promise<unknown>) =>
        fn(tx),
    });
    auth.mockResolvedValue({ user: { id: userId, login: "dev" } });
    acquireNamedPostgresAdvisoryLock.mockResolvedValue(undefined);
    loadTenancyDb.mockResolvedValue({
      ...emptyDb(),
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
    expect(deleteOrganizationRow).toHaveBeenCalledWith(tx, "org-gone");
  });

  it("persists connect inserts, deletes, and evidence", async () => {
    const project = testProject({ id: "p9", orgId, ownerUserId: userId });
    const result = await withConnectWrite({ activeProjectId: null }, async () => ({
      result: "connected",
      insertProjects: [project],
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
    expect(insertProject).toHaveBeenCalledWith(tx, project);
    expect(insertEvidenceRecords).toHaveBeenCalledWith(
      tx,
      expect.arrayContaining([expect.objectContaining({ id: "ev1" })]),
    );
  });
});
