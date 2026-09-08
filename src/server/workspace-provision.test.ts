import { beforeEach, describe, expect, it, vi } from "vitest";

const getDrizzle = vi.hoisted(() => vi.fn());
const provisionPersonalOrg = vi.hoisted(() => vi.fn());

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("./active-cookies", () => ({
  readActiveOrgCookie: vi.fn(),
  readActiveProjectCookie: vi.fn(),
}));
vi.mock("@complyloop/db/client", () => ({ getDrizzle }));
vi.mock("@complyloop/db/repo/orgs", () => ({
  provisionPersonalOrg,
}));

import { ensurePersonalOrgProvisioned } from "./personal-org";

describe("ensurePersonalOrgProvisioned", () => {
  const drizzle = { kind: "drizzle" };

  beforeEach(() => {
    vi.clearAllMocks();
    getDrizzle.mockResolvedValue(drizzle);
    provisionPersonalOrg.mockResolvedValue({ created: false });
  });

  it("delegates provisioning to the DB repo", async () => {
    await ensurePersonalOrgProvisioned("user-1", "dev");

    expect(provisionPersonalOrg).toHaveBeenCalledOnce();
    expect(provisionPersonalOrg).toHaveBeenCalledWith(drizzle, "user-1", "dev");
  });
});
