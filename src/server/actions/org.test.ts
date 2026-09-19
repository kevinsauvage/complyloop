import "@/test-fixtures/register-action-workspace-mock";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Organization } from "@complyloop/analysis-core/contract/project-types";
import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import type { WorkspaceSlice } from "@complyloop/db/types";
import { emptyWorkspaceSlice as emptyDbBase } from "@complyloop/db/types";

import { initialActionState } from "@/core/actions/action-state";
import {
  actionAuthMocks,
  actionWorkspaceMocks,
} from "@/test-fixtures/action-workspace-mocks";
import { testMembership } from "@/test-fixtures/membership";
import { testProject } from "@/test-fixtures/project";
import { testWorkspace } from "@/test-fixtures/workspace";

import type { ProjectWriteWorkspace } from "../workspace/workspace";
import {
  changeOrgMemberRoleAction,
  createOrgAction,
  deleteOrgAction,
  exportOrgDataAction,
  inviteOrgMemberAction,
  leaveOrgMemberAction,
  removeOrgMemberAction,
  switchOrgAction,
} from "./org";

const { getWorkspace, withOrgWrite } = actionWorkspaceMocks;
const exportOrgData = vi.hoisted(() => vi.fn());
const deleteOrganization = vi.hoisted(() => vi.fn());
const resolveActiveOrgId = vi.hoisted(() => vi.fn());
const writeActiveOrgCookie = vi.hoisted(() => vi.fn());
const writeActiveProjectCookie = vi.hoisted(() => vi.fn());
const clearActiveProjectCookie = vi.hoisted(() => vi.fn());
const readActiveOrgCookie = vi.hoisted(() => vi.fn());
const assertOrgCreateRateLimit = vi.hoisted(() => vi.fn());
const assertOrgInviteRateLimit = vi.hoisted(() => vi.fn());
const assertExportRateLimit = vi.hoisted(() => vi.fn());

vi.mock("../rate-limit", async () => {
  const actual =
    await vi.importActual<typeof import("../rate-limit")>("../rate-limit");
  return {
    ...actual,
    assertOrgCreateRateLimit: (...args: unknown[]) =>
      assertOrgCreateRateLimit(...args),
    assertOrgInviteRateLimit: (...args: unknown[]) =>
      assertOrgInviteRateLimit(...args),
    assertExportRateLimit: (...args: unknown[]) =>
      assertExportRateLimit(...args),
  };
});
const refresh = vi.hoisted(() => vi.fn());
const listFindingsForProjects = vi.hoisted(() => vi.fn());
const listRemediationsForProjects = vi.hoisted(() => vi.fn());
const listRequirementsForProjects = vi.hoisted(() => vi.fn());
const listAlertsForProjects = vi.hoisted(() => vi.fn());
const lookupGitHubUser = vi.hoisted(() => vi.fn());

vi.mock("../workspace/orgs", async () => {
  const actual =
    await vi.importActual<typeof import("../workspace/orgs")>(
      "../workspace/orgs",
    );
  return {
    ...actual,
    exportOrgData: (...args: unknown[]) => exportOrgData(...args),
    deleteOrganization: (...args: unknown[]) => deleteOrganization(...args),
  };
});

vi.mock("../workspace/org-queries", async () => {
  const actual = await vi.importActual<
    typeof import("../workspace/org-queries")
  >("../workspace/org-queries");
  return {
    ...actual,
    resolveActiveOrgId: (...args: unknown[]) => resolveActiveOrgId(...args),
  };
});

vi.mock("../workspace/active-cookies", () => ({
  writeActiveOrgCookie: (...args: unknown[]) => writeActiveOrgCookie(...args),
  writeActiveProjectCookie: (...args: unknown[]) =>
    writeActiveProjectCookie(...args),
  clearActiveProjectCookie: (...args: unknown[]) =>
    clearActiveProjectCookie(...args),
  readActiveOrgCookie: (...args: unknown[]) => readActiveOrgCookie(...args),
  readActiveProjectCookie: vi.fn(),
}));

vi.mock("./shared", async () => {
  const { actionAuthMocks } =
    await import("@/test-fixtures/action-workspace-mocks");
  const { PublicError } =
    await import("@complyloop/analysis-core/contract/public-error");
  return {
    refresh: () => refresh(),
    requireSignedIn: async (message: string) => {
      const session = await actionAuthMocks.auth();
      const userId = session?.user?.id;
      if (!userId) throw new PublicError(message);
      return { userId, githubLogin: session?.user?.login ?? null };
    },
  };
});

vi.mock("@complyloop/db/postgres", () => ({
  getDrizzle: async () => ({}),
}));

vi.mock("@complyloop/db/repo/evidence", () => ({
  listEvidenceForExportForProjects: async () => ({
    records: [],
    total: 0,
    limitPerProject: 5_000,
    truncatedProjectIds: [],
  }),
}));
vi.mock("@complyloop/db/repo/assessments", () => ({
  listAssessmentsForProjects: async () => [],
}));
vi.mock("@complyloop/db/repo/findings", () => ({
  listFindingsForProjects: (...args: unknown[]) =>
    listFindingsForProjects(...args),
}));
vi.mock("@complyloop/db/repo/remediations", () => ({
  listRemediationsForProjects: (...args: unknown[]) =>
    listRemediationsForProjects(...args),
}));
vi.mock("@complyloop/db/repo/requirements", () => ({
  listRequirementsForProjects: (...args: unknown[]) =>
    listRequirementsForProjects(...args),
}));
vi.mock("@complyloop/db/repo/alerts", () => ({
  listAlertsForProjects: (...args: unknown[]) => listAlertsForProjects(...args),
}));

vi.mock("../github/github", async () => {
  const actual =
    await vi.importActual<typeof import("../github/github")>(
      "../github/github",
    );
  return {
    ...actual,
    lookupGitHubUser: (...args: unknown[]) => lookupGitHubUser(...args),
  };
});
const org: Organization = {
  id: "org-1",
  name: "Acme",
  slug: "acme",
  createdAt: "2026-01-01T00:00:00.000Z",
};

const project = testProject({ orgId: "org-1", ownerUserId: "user-1" });

const ownerMembership = testMembership("owner", {
  id: "m-owner",
  githubLogin: "alice",
});

async function invokeOrgWrite(
  ctx: {
    db: WorkspaceSlice;
    userId: string;
    githubLogin: string | null;
    organizations: (typeof org)[];
  },
  fn: (ctx: {
    db: WorkspaceSlice;
    userId: string;
    githubLogin: string | null;
    organizations: (typeof org)[];
  }) => Promise<{ result: unknown }> | { result: unknown },
): Promise<unknown> {
  const out = await fn(ctx);
  return out.result;
}

function emptyWorkspaceSlice(memberships = [ownerMembership]): WorkspaceSlice {
  return {
    ...emptyDbBase(),
    organizations: [org],
    memberships: [...memberships],
    projects: [project],
  };
}

function fixtureWorkspace(
  db: WorkspaceSlice = emptyWorkspaceSlice(),
): ProjectWriteWorkspace {
  return testWorkspace({
    role: "owner",
    userId: "user-1",
    project,
    findings: [],
    remediations: [],
    db,
  });
}

beforeEach(() => {
  actionAuthMocks.auth.mockReset();
  getWorkspace.mockReset();
  withOrgWrite.mockReset();
  exportOrgData.mockReset();
  deleteOrganization.mockReset();
  resolveActiveOrgId.mockReset();
  writeActiveOrgCookie.mockReset();
  writeActiveProjectCookie.mockReset();
  clearActiveProjectCookie.mockReset();
  refresh.mockReset();
  listFindingsForProjects.mockReset();
  listFindingsForProjects.mockResolvedValue([]);
  listRemediationsForProjects.mockReset();
  listRemediationsForProjects.mockResolvedValue([]);
  listRequirementsForProjects.mockReset();
  listRequirementsForProjects.mockResolvedValue([]);
  listAlertsForProjects.mockReset();
  listAlertsForProjects.mockResolvedValue([]);
  deleteOrganization.mockReturnValue({ deleteMembershipIds: ["m-owner"] });
  lookupGitHubUser.mockReset();
  lookupGitHubUser.mockResolvedValue({ status: "found", login: "bob" });
  actionAuthMocks.getGitHubAccessToken.mockReset();
  actionAuthMocks.getGitHubAccessToken.mockResolvedValue(null);
  readActiveOrgCookie.mockReset();
  readActiveOrgCookie.mockResolvedValue(null);
  actionAuthMocks.auth.mockResolvedValue({
    user: { id: "user-1", login: "alice" },
  });
  withOrgWrite.mockImplementation(async (fn) =>
    invokeOrgWrite(
      {
        db: fixtureWorkspace().db,
        userId: "user-1",
        githubLogin: "alice",
        organizations: [org],
      },
      fn,
    ),
  );
  getWorkspace.mockResolvedValue(fixtureWorkspace());
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("org lifecycle actions", () => {
  it("exports organization JSON for a signed-in owner", async () => {
    exportOrgData.mockReturnValue({ organization: org, projects: [project] });
    const result = await exportOrgDataAction("org-1");
    expect(result.error).toBeNull();
    expect(result.json).toContain('"slug": "acme"');
    expect(exportOrgData).toHaveBeenCalledWith(
      expect.anything(),
      "org-1",
      "user-1",
      { evidenceTruncatedProjectIds: [] },
    );
  });

  it("rejects export when unsigned", async () => {
    actionAuthMocks.auth.mockResolvedValue(null);
    await expect(exportOrgDataAction("org-1")).resolves.toEqual({
      error: "Sign in to export organization data.",
      json: null,
    });
  });

  it("rate-limits organization export per user", async () => {
    exportOrgData.mockReturnValue({ organization: org, projects: [project] });
    const result = await exportOrgDataAction("org-1");
    expect(result.error).toBeNull();
    expect(assertExportRateLimit).toHaveBeenCalledWith("user-1");
  });

  it("loads org rows with one set-based query per entity type", async () => {
    const projects = [0, 1, 2].map((index) =>
      testProject({ id: `p-${index}`, orgId: "org-1", ownerUserId: "user-1" }),
    );
    const db = {
      ...emptyDbBase(),
      organizations: [org],
      memberships: [ownerMembership],
      projects,
    };
    getWorkspace.mockResolvedValue(
      testWorkspace({
        role: "owner",
        userId: "user-1",
        project: projects[0],
        findings: [],
        remediations: [],
        db,
      }),
    );
    exportOrgData.mockReturnValue({ organization: org, projects });
    const result = await exportOrgDataAction("org-1");
    expect(result.error).toBeNull();
    const projectIds = ["p-0", "p-1", "p-2"];
    expect(listFindingsForProjects).toHaveBeenCalledTimes(1);
    expect(listFindingsForProjects).toHaveBeenCalledWith(
      expect.anything(),
      projectIds,
    );
    expect(listRemediationsForProjects).toHaveBeenCalledWith(
      expect.anything(),
      projectIds,
    );
    expect(listRequirementsForProjects).toHaveBeenCalledWith(
      expect.anything(),
      projectIds,
    );
    expect(listAlertsForProjects).toHaveBeenCalledWith(
      expect.anything(),
      projectIds,
    );
  });

  it("rejects exports beyond the project cap", async () => {
    const projects = Array.from({ length: 51 }, (_, index) =>
      testProject({ id: `p-${index}`, orgId: "org-1", ownerUserId: "user-1" }),
    );
    const db = {
      ...emptyDbBase(),
      organizations: [org],
      memberships: [ownerMembership],
      projects,
    };
    getWorkspace.mockResolvedValue(
      testWorkspace({
        role: "owner",
        userId: "user-1",
        project: projects[0],
        findings: [],
        remediations: [],
        db,
      }),
    );
    await expect(exportOrgDataAction("org-1")).resolves.toEqual({
      error: expect.stringMatching(/limited to 50 projects/),
      json: null,
    });
    expect(listFindingsForProjects).not.toHaveBeenCalled();
  });

  it("maps public export failures to their message", async () => {
    exportOrgData.mockImplementation(() => {
      throw new PublicError("Only the organization owner can export data.");
    });
    await expect(exportOrgDataAction("org-1")).resolves.toEqual({
      error: "Only the organization owner can export data.",
      json: null,
    });
  });

  it("sanitizes unexpected export failures", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(
      "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    );
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    exportOrgData.mockImplementation(() => {
      throw new Error("ECONNREFUSED 127.0.0.1:5432");
    });
    await expect(exportOrgDataAction("org-1")).resolves.toEqual({
      error: "The action could not be completed. Reference: aaaaaaaabbbb",
      json: null,
    });
  });

  it("requires DELETE confirmation before deleting an organization", async () => {
    const formData = new FormData();
    formData.set("orgId", "org-1");
    formData.set("confirm", "nope");
    const result = await deleteOrgAction(initialActionState, formData);
    expect(result.ok ? null : result.message).toMatch(/Type DELETE/);
    expect(deleteOrganization).not.toHaveBeenCalled();
  });

  it("deletes the organization and switches the active org cookie", async () => {
    resolveActiveOrgId.mockReturnValue("org-personal");
    const formData = new FormData();
    formData.set("orgId", "org-1");
    formData.set("confirm", "DELETE");
    const result = await deleteOrgAction(initialActionState, formData);
    expect(result.ok ? null : result.message).toBeNull();
    expect(result.message).toMatch(/including its evidence history/);
    expect(deleteOrganization).toHaveBeenCalledWith(
      expect.anything(),
      "org-1",
      "user-1",
    );
    expect(writeActiveOrgCookie).toHaveBeenCalledWith("org-personal");
    expect(refresh).toHaveBeenCalled();
  });
});

describe("switchOrgAction", () => {
  it("switches org and activates a project in that org", async () => {
    const form = new FormData();
    form.set("orgId", "org-1");
    await switchOrgAction(form);
    expect(writeActiveOrgCookie).toHaveBeenCalledWith("org-1");
    expect(writeActiveProjectCookie).toHaveBeenCalledWith("p1");
    expect(refresh).toHaveBeenCalled();
  });

  it("rejects when unsigned", async () => {
    actionAuthMocks.auth.mockResolvedValue(null);
    const form = new FormData();
    form.set("orgId", "org-1");
    await expect(switchOrgAction(form)).rejects.toThrow(/Sign in/);
  });

  it("rejects orgs the user does not belong to", async () => {
    const form = new FormData();
    form.set("orgId", "org-other");
    await expect(switchOrgAction(form)).rejects.toThrow(/not a member/);
  });

  it("clears the project cookie when the target org has no projects", async () => {
    const emptyOrg: Organization = {
      id: "org-empty",
      name: "Empty",
      slug: "empty",
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    const db = {
      ...emptyWorkspaceSlice(),
      organizations: [org, emptyOrg],
      memberships: [
        ownerMembership,
        testMembership("owner", {
          id: "m-empty",
          orgId: "org-empty",
          githubLogin: "alice",
        }),
      ],
    };
    getWorkspace.mockResolvedValue(fixtureWorkspace(db));
    const form = new FormData();
    form.set("orgId", "org-empty");
    await switchOrgAction(form);
    expect(writeActiveOrgCookie).toHaveBeenCalledWith("org-empty");
    expect(writeActiveProjectCookie).not.toHaveBeenCalled();
    expect(clearActiveProjectCookie).toHaveBeenCalled();
  });
});

describe("createOrgAction", () => {
  it("creates an organization for a signed-in GitHub user", async () => {
    const form = new FormData();
    form.set("name", "New Co");
    const result = await createOrgAction(initialActionState, form);
    expect(result.ok ? null : result.message).toBeNull();
    expect(result.message).toMatch(/Created organization "New Co"/);
    expect(writeActiveOrgCookie).toHaveBeenCalled();
  });

  it("requires a name", async () => {
    const result = await createOrgAction(initialActionState, new FormData());
    expect(result.ok ? null : result.message).toMatch(/organization name/i);
  });

  it("requires GitHub sign-in", async () => {
    actionAuthMocks.auth.mockResolvedValue({ user: { id: "user-1" } });
    const form = new FormData();
    form.set("name", "No Login");
    const result = await createOrgAction(initialActionState, form);
    expect(result.ok ? null : result.message).toMatch(/Sign in with GitHub/);
  });
});

describe("org member management actions", () => {
  it("invites a member", async () => {
    const form = new FormData();
    form.set("orgId", "org-1");
    form.set("githubLogin", "bob");
    form.set("role", "member");
    const result = await inviteOrgMemberAction(initialActionState, form);
    expect(result.message).toMatch(/Invited @bob as member/);
    expect(assertOrgInviteRateLimit).toHaveBeenCalledWith("user-1");
  });

  it("rejects a misspelled GitHub username when the inviter has a token", async () => {
    actionAuthMocks.getGitHubAccessToken.mockResolvedValue("gho_inviter");
    lookupGitHubUser.mockResolvedValue({ status: "not-found" });
    const form = new FormData();
    form.set("orgId", "org-1");
    form.set("githubLogin", "bbo");
    form.set("role", "member");
    const result = await inviteOrgMemberAction(initialActionState, form);
    expect(result.ok ? null : result.message).toMatch(
      /No GitHub user "@bbo" — check the spelling/,
    );
    expect(lookupGitHubUser).toHaveBeenCalledWith("gho_inviter", "bbo");
  });

  it("names role changes on re-invite instead of saying Invited", async () => {
    const bob = testMembership("member", {
      id: "m-bob",
      userId: "user-2",
      githubLogin: "bob",
    });
    const db = emptyWorkspaceSlice([ownerMembership, bob]);
    withOrgWrite.mockImplementation(async (fn) =>
      invokeOrgWrite(
        {
          db,
          userId: "user-1",
          githubLogin: "alice",
          organizations: [org],
        },
        fn,
      ),
    );
    const form = new FormData();
    form.set("orgId", "org-1");
    form.set("githubLogin", "bob");
    form.set("role", "admin");
    const result = await inviteOrgMemberAction(initialActionState, form);
    expect(result.message).toBe("Updated @bob role to admin.");
  });

  it("rejects owner role on invite", async () => {
    const form = new FormData();
    form.set("orgId", "org-1");
    form.set("githubLogin", "bob");
    form.set("role", "owner");
    const result = await inviteOrgMemberAction(initialActionState, form);
    expect(result.ok ? null : result.message).toMatch(/Choose a role/);
  });

  it("requires a GitHub username to invite", async () => {
    const form = new FormData();
    form.set("orgId", "org-1");
    form.set("role", "viewer");
    const result = await inviteOrgMemberAction(initialActionState, form);
    expect(result.ok ? null : result.message).toMatch(/GitHub username/);
  });

  it("removes a member", async () => {
    const member = testMembership("member", {
      id: "m-member",
      userId: "user-2",
      githubLogin: "bob",
    });
    const db = emptyWorkspaceSlice([ownerMembership, member]);
    withOrgWrite.mockImplementation(async (fn) =>
      invokeOrgWrite(
        {
          db,
          userId: "user-1",
          githubLogin: "alice",
          organizations: [org],
        },
        fn,
      ),
    );

    const form = new FormData();
    form.set("orgId", "org-1");
    form.set("membershipId", "m-member");
    const result = await removeOrgMemberAction(initialActionState, form);
    expect(result.message).toBe("Member removed.");
  });

  it("revokes a pending invite", async () => {
    const invite = {
      id: "m-invite",
      orgId: "org-1",
      role: "viewer" as const,
      githubLogin: "carol",
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    const db = emptyWorkspaceSlice([ownerMembership, invite]);
    withOrgWrite.mockImplementation(async (fn) =>
      invokeOrgWrite(
        {
          db,
          userId: "user-1",
          githubLogin: "alice",
          organizations: [org],
        },
        fn,
      ),
    );

    const form = new FormData();
    form.set("orgId", "org-1");
    form.set("membershipId", "m-invite");
    const result = await removeOrgMemberAction(initialActionState, form);
    expect(result.message).toBe("Invite revoked.");
  });

  it("lets a member leave the org", async () => {
    const bob = testMembership("member", {
      id: "m-bob",
      userId: "user-2",
      githubLogin: "bob",
    });
    const db = emptyWorkspaceSlice([ownerMembership, bob]);
    withOrgWrite.mockImplementation(async (fn) =>
      invokeOrgWrite(
        {
          db,
          userId: "user-2",
          githubLogin: "bob",
          organizations: [org],
        },
        fn,
      ),
    );
    actionAuthMocks.auth.mockResolvedValue({
      user: { id: "user-2", login: "bob" },
    });

    const form = new FormData();
    form.set("orgId", "org-1");
    const result = await leaveOrgMemberAction(initialActionState, form);
    expect(result.message).toBe("You left the organization.");
    expect(clearActiveProjectCookie).not.toHaveBeenCalled();
  });

  it("clears the project cookie when leaving the active org", async () => {
    const bob = testMembership("member", {
      id: "m-bob",
      userId: "user-2",
      githubLogin: "bob",
    });
    const db = emptyWorkspaceSlice([ownerMembership, bob]);
    withOrgWrite.mockImplementation(async (fn) =>
      invokeOrgWrite(
        {
          db,
          userId: "user-2",
          githubLogin: "bob",
          organizations: [org],
        },
        fn,
      ),
    );
    actionAuthMocks.auth.mockResolvedValue({
      user: { id: "user-2", login: "bob" },
    });
    readActiveOrgCookie.mockResolvedValue("org-1");

    const form = new FormData();
    form.set("orgId", "org-1");
    const result = await leaveOrgMemberAction(initialActionState, form);
    expect(result.message).toBe("You left the organization.");
    expect(clearActiveProjectCookie).toHaveBeenCalled();
  });

  it("blocks the last owner and the last member from leaving", async () => {
    const bob = testMembership("member", {
      id: "m-bob",
      userId: "user-2",
      githubLogin: "bob",
    });
    const db = emptyWorkspaceSlice([ownerMembership, bob]);
    withOrgWrite.mockImplementation(async (fn) =>
      invokeOrgWrite(
        {
          db,
          userId: "user-1",
          githubLogin: "alice",
          organizations: [org],
        },
        fn,
      ),
    );
    const form = new FormData();
    form.set("orgId", "org-1");
    await expect(
      leaveOrgMemberAction(initialActionState, form),
    ).resolves.toEqual({
      ok: false,
      message: "You are the last owner — assign another owner before leaving.",
    });

    const soloDb = emptyWorkspaceSlice([ownerMembership]);
    withOrgWrite.mockImplementation(async (fn) =>
      invokeOrgWrite(
        {
          db: soloDb,
          userId: "user-1",
          githubLogin: "alice",
          organizations: [org],
        },
        fn,
      ),
    );
    await expect(
      leaveOrgMemberAction(initialActionState, form),
    ).resolves.toEqual({
      ok: false,
      message:
        "You are the last member — delete the organization instead of leaving it.",
    });
  });

  it("changes a member role", async () => {
    const member = testMembership("member", {
      id: "m-member",
      userId: "user-2",
      githubLogin: "bob",
    });
    const db = emptyWorkspaceSlice([ownerMembership, member]);
    withOrgWrite.mockImplementation(async (fn) =>
      invokeOrgWrite(
        {
          db,
          userId: "user-1",
          githubLogin: "alice",
          organizations: [org],
        },
        fn,
      ),
    );

    const form = new FormData();
    form.set("orgId", "org-1");
    form.set("membershipId", "m-member");
    form.set("role", "admin");
    const result = await changeOrgMemberRoleAction(initialActionState, form);
    expect(result.message).toBe("Role updated to admin.");
    expect(member.role).toBe("member");
  });

  it("denies member management to non-managers", async () => {
    const memberCaller = testMembership("member", {
      id: "m-caller",
      userId: "user-1",
      githubLogin: "alice",
    });
    const db = emptyWorkspaceSlice([memberCaller]);
    withOrgWrite.mockImplementation(async (fn) =>
      invokeOrgWrite(
        {
          db,
          userId: "user-1",
          githubLogin: "alice",
          organizations: [org],
        },
        fn,
      ),
    );

    const inviteForm = new FormData();
    inviteForm.set("orgId", "org-1");
    inviteForm.set("githubLogin", "bob");
    inviteForm.set("role", "member");
    await expect(
      inviteOrgMemberAction(initialActionState, inviteForm),
    ).resolves.toEqual({
      ok: false,
      message: "Only org owners and admins can invite members.",
    });

    const removeForm = new FormData();
    removeForm.set("orgId", "org-1");
    removeForm.set("membershipId", "m-caller");
    await expect(
      removeOrgMemberAction(initialActionState, removeForm),
    ).resolves.toEqual({
      ok: false,
      message: "Only org owners and admins can remove members.",
    });

    const roleForm = new FormData();
    roleForm.set("orgId", "org-1");
    roleForm.set("membershipId", "m-caller");
    roleForm.set("role", "admin");
    await expect(
      changeOrgMemberRoleAction(initialActionState, roleForm),
    ).resolves.toEqual({
      ok: false,
      message: "Only org owners and admins can change member roles.",
    });
  });
});
