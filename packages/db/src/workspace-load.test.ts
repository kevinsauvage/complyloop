import { beforeEach, describe, expect, it, vi } from "vitest";

const provisionPersonalOrg = vi.hoisted(() => vi.fn());
const listOrgIdsForUser = vi.hoisted(() => vi.fn());
const listOrganizationsForUser = vi.hoisted(() => vi.fn());
const listMembershipsForOrgs = vi.hoisted(() => vi.fn());
const listProjectsForOrgs = vi.hoisted(() => vi.fn());

vi.mock("./repo/orgs.ts", () => ({
  provisionPersonalOrg: (...args: unknown[]) => provisionPersonalOrg(...args),
  listOrgIdsForUser: (...args: unknown[]) => listOrgIdsForUser(...args),
  listOrganizationsForUser: (...args: unknown[]) =>
    listOrganizationsForUser(...args),
  listMembershipsForOrgs: (...args: unknown[]) =>
    listMembershipsForOrgs(...args),
}));

vi.mock("./repo/projects.ts", () => ({
  listProjectsForOrgs: (...args: unknown[]) => listProjectsForOrgs(...args),
  getProjectById: vi.fn(),
}));

import type { DrizzleDb } from "./postgres.ts";
import { loadTenancyDb } from "./workspace-load.ts";

describe("loadTenancyDb claim-on-workspace-load", () => {
  const drizzle = { kind: "drizzle" } as unknown as DrizzleDb;

  beforeEach(() => {
    vi.clearAllMocks();
    provisionPersonalOrg.mockResolvedValue({ created: false });
    listOrgIdsForUser.mockResolvedValue([]);
    listOrganizationsForUser.mockResolvedValue([]);
    listMembershipsForOrgs.mockResolvedValue([]);
    listProjectsForOrgs.mockResolvedValue([]);
  });

  it("claims pending invites before listing orgs when signed in", async () => {
    await loadTenancyDb(drizzle, {
      userId: "user-1",
      githubLogin: "alice",
      activeProjectId: null,
    });

    expect(provisionPersonalOrg).toHaveBeenCalledOnce();
    expect(provisionPersonalOrg).toHaveBeenCalledWith(
      drizzle,
      "user-1",
      "alice",
    );
    expect(listOrgIdsForUser).toHaveBeenCalledOnce();
    expect(provisionPersonalOrg.mock.invocationCallOrder[0]!).toBeLessThan(
      listOrgIdsForUser.mock.invocationCallOrder[0]!,
    );
  });

  it("skips provisioning when the viewer is unsigned", async () => {
    await loadTenancyDb(drizzle, {
      userId: null,
      githubLogin: null,
      activeProjectId: null,
    });
    expect(provisionPersonalOrg).not.toHaveBeenCalled();
    expect(listOrgIdsForUser).toHaveBeenCalledWith(drizzle, null, null);
  });
});
