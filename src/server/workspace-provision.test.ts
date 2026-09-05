import { beforeEach, describe, expect, it, vi } from "vitest";

const getDrizzle = vi.hoisted(() => vi.fn());
const listOrgIdsForUser = vi.hoisted(() => vi.fn());
const listOrganizationsForUser = vi.hoisted(() => vi.fn());
const listMembershipsForOrgs = vi.hoisted(() => vi.fn());
const claimMembershipsForLogin = vi.hoisted(() => vi.fn());
const insertOrganization = vi.hoisted(() => vi.fn());
const insertMembership = vi.hoisted(() => vi.fn());
const isPersonalOrgProvisioned = vi.hoisted(() => vi.fn());

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("./active-cookies", () => ({
  readActiveOrgCookie: vi.fn(),
  readActiveProjectCookie: vi.fn(),
}));
vi.mock("@complyloop/db/client", () => ({ getDrizzle }));
vi.mock("@complyloop/db/postgres-queries", () => ({ listOrgIdsForUser }));
vi.mock("@complyloop/db/repo/orgs", () => ({
  claimMembershipsForLogin,
  insertOrganization,
  insertMembership,
  isPersonalOrgProvisioned,
  deleteMembership: vi.fn(),
  deleteOrganizationRow: vi.fn(),
  listMembershipsForOrgs,
  listOrganizationsForUser,
  upsertMembership: vi.fn(),
}));

import { ensurePersonalOrgProvisioned } from "./workspace";

describe("ensurePersonalOrgProvisioned", () => {
  const tx = { kind: "tx" };

  beforeEach(() => {
    vi.clearAllMocks();
    getDrizzle.mockResolvedValue({
      transaction: async (fn: (innerTx: typeof tx) => Promise<unknown>) =>
        fn(tx),
    });
    listOrgIdsForUser.mockResolvedValue([]);
    listOrganizationsForUser.mockResolvedValue([]);
    listMembershipsForOrgs.mockResolvedValue([]);
    claimMembershipsForLogin.mockResolvedValue(undefined);
    insertOrganization.mockResolvedValue(undefined);
    insertMembership.mockResolvedValue(undefined);
    isPersonalOrgProvisioned.mockResolvedValue(false);
  });

  it("persists a newly created personal org when the user has none in Postgres", async () => {
    await ensurePersonalOrgProvisioned("user-1", "dev");

    expect(insertOrganization).toHaveBeenCalledOnce();
    expect(insertMembership).toHaveBeenCalledOnce();
    expect(insertMembership).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        userId: "user-1",
        role: "owner",
        githubLogin: "dev",
      }),
    );
  });

  it("skips all writes when the personal org is already claimed", async () => {
    isPersonalOrgProvisioned.mockResolvedValue(true);

    await ensurePersonalOrgProvisioned("user-1", "dev");

    expect(listOrgIdsForUser).not.toHaveBeenCalled();
    expect(claimMembershipsForLogin).not.toHaveBeenCalled();
    expect(insertOrganization).not.toHaveBeenCalled();
  });

  it("does not re-insert when the user already owns an org in Postgres", async () => {
    listOrgIdsForUser.mockResolvedValue(["org-existing"]);
    listOrganizationsForUser.mockResolvedValue([
      { id: "org-existing", name: "Dev", slug: "dev", createdAt: "2026-01-01" },
    ]);
    listMembershipsForOrgs.mockResolvedValue([
      {
        id: "mem-1",
        orgId: "org-existing",
        userId: "user-1",
        role: "owner",
        githubLogin: "dev",
        createdAt: "2026-01-01",
      },
    ]);

    await ensurePersonalOrgProvisioned("user-1", "dev");

    expect(insertOrganization).not.toHaveBeenCalled();
    expect(insertMembership).not.toHaveBeenCalled();
  });
});
