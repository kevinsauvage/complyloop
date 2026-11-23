import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { OrgMembership } from "@complyloop/analysis-core/contract/project-types";

import { withOrgAiWrite } from "./org-ai-write";

const getSession = vi.hoisted(() => vi.fn());
const listMembershipsForOrgs = vi.hoisted(() => vi.fn());
const acquireNamedPostgresAdvisoryLock = vi.hoisted(() => vi.fn());

vi.mock("@complyloop/db/postgres", () => ({
  getDrizzle: async () => ({
    transaction: async (fn: (tx: Record<string, never>) => Promise<unknown>) =>
      fn({}),
  }),
  orgAiWriteLockKey: (orgId: string) => `org-ai-settings:${orgId}`,
  acquireNamedPostgresAdvisoryLock: (...args: unknown[]) =>
    acquireNamedPostgresAdvisoryLock(...args),
}));

vi.mock("@complyloop/db/repo/orgs", () => ({
  listMembershipsForOrgs: (...args: unknown[]) =>
    listMembershipsForOrgs(...args),
}));

vi.mock("../auth-session", () => ({
  getSession: (...args: unknown[]) => getSession(...args),
}));

function membership(role: OrgMembership["role"]): OrgMembership {
  return {
    id: "m-1",
    orgId: "org-1",
    role,
    userId: "user-1",
    githubLogin: "alice",
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

beforeEach(() => {
  getSession.mockResolvedValue({ user: { id: "user-1", login: "alice" } });
  listMembershipsForOrgs.mockResolvedValue([membership("admin")]);
  acquireNamedPostgresAdvisoryLock.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("withOrgAiWrite", () => {
  it("runs the callback under the org AI lock for an admin", async () => {
    const result = await withOrgAiWrite("org-1", async ({ actor }) => actor);
    expect(result).toBe("alice");
    expect(acquireNamedPostgresAdvisoryLock).toHaveBeenCalledWith(
      {},
      "org-ai-settings:org-1",
    );
  });

  it("refuses a member without org.manage_ai", async () => {
    listMembershipsForOrgs.mockResolvedValue([membership("member")]);
    await expect(
      withOrgAiWrite("org-1", async () => "written"),
    ).rejects.toThrow(/org\.manage_ai/);
  });

  it("requires a signed-in session", async () => {
    getSession.mockResolvedValue(null);
    await expect(
      withOrgAiWrite("org-1", async () => "written"),
    ).rejects.toThrow(/Sign in/);
    expect(acquireNamedPostgresAdvisoryLock).not.toHaveBeenCalled();
  });
});
