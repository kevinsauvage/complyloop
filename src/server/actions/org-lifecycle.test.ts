import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PublicError } from "@/core/public-error";
import type { Organization, OrgMembership } from "@/core/project-types";
import { testProject } from "@/test-fixtures/project";
import { emptyActionMessageState } from "../action-state";
import {
  changeOrgMemberRoleAction,
  createOrgAction,
  deleteOrgAction,
  exportOrgDataAction,
  inviteOrgMemberAction,
  removeOrgMemberAction,
  switchOrgAction,
} from "./org";
import type { Db } from "../db";
import type { Workspace } from "../workspace";

const auth = vi.hoisted(() => vi.fn());
const getWorkspace = vi.hoisted(() => vi.fn());
const withWorkspaceWrite = vi.hoisted(() => vi.fn());
const exportOrgData = vi.hoisted(() => vi.fn());
const deleteOrganization = vi.hoisted(() => vi.fn());
const resolveActiveOrgId = vi.hoisted(() => vi.fn());
const writeActiveOrgCookie = vi.hoisted(() => vi.fn());
const writeActiveProjectCookie = vi.hoisted(() => vi.fn());
const refresh = vi.hoisted(() => vi.fn());

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/auth", () => ({
  auth: () => auth(),
}));

vi.mock("../workspace", async () => {
  const actual = await vi.importActual<typeof import("../workspace")>(
    "../workspace",
  );
  return {
    ...actual,
    getWorkspace: () => getWorkspace(),
    withWorkspaceWrite: (fn: (workspace: Workspace) => unknown) =>
      withWorkspaceWrite(fn),
  };
});

vi.mock("../orgs", async () => {
  const actual = await vi.importActual<typeof import("../orgs")>("../orgs");
  return {
    ...actual,
    exportOrgData: (...args: unknown[]) => exportOrgData(...args),
    deleteOrganization: (...args: unknown[]) => deleteOrganization(...args),
    resolveActiveOrgId: (...args: unknown[]) => resolveActiveOrgId(...args),
  };
});

vi.mock("../active-cookies", () => ({
  writeActiveOrgCookie: (...args: unknown[]) => writeActiveOrgCookie(...args),
  writeActiveProjectCookie: (...args: unknown[]) =>
    writeActiveProjectCookie(...args),
  readActiveOrgCookie: vi.fn(),
  readActiveProjectCookie: vi.fn(),
}));

vi.mock("./shared", () => ({
  refresh: () => refresh(),
}));

vi.mock("../db-store/client", () => ({
  getDrizzle: async () => ({}),
}));

vi.mock("../db-store/postgres-queries", () => ({
  listAllEvidenceForProjects: async () => [],
}));

const org: Organization = {
  id: "org-1",
  name: "Acme",
  slug: "acme",
  createdAt: "2026-01-01T00:00:00.000Z",
};

const project = testProject({ orgId: "org-1", ownerUserId: "user-1" });

const ownerMembership: OrgMembership = {
  id: "m-owner",
  orgId: "org-1",
  role: "owner",
  userId: "user-1",
  githubLogin: "alice",
  createdAt: "2026-01-01T00:00:00.000Z",
};

function emptyDb(memberships: OrgMembership[] = [ownerMembership]): Db {
  return {
    frameworks: [],
    controls: [],
    organizations: [org],
    memberships: [...memberships],
    projects: [project],
    requirements: [],
    assessments: [],
    findings: [],
    remediations: [],
    evidence: [],
    alerts: [],
  };
}

function fixtureWorkspace(db: Db = emptyDb()): Workspace {
  return {
    db,
    project,
    userId: "user-1",
    githubLogin: "alice",
    access: {
      userId: "user-1",
      githubLogin: "alice",
      organizations: [org],
      memberships: db.memberships,
    },
    visibleProjects: [project],
    organizations: [org],
    activeOrgId: org.id,
  };
}

beforeEach(() => {
  auth.mockReset();
  getWorkspace.mockReset();
  withWorkspaceWrite.mockReset();
  exportOrgData.mockReset();
  deleteOrganization.mockReset();
  resolveActiveOrgId.mockReset();
  writeActiveOrgCookie.mockReset();
  writeActiveProjectCookie.mockReset();
  refresh.mockReset();
  auth.mockResolvedValue({ user: { id: "user-1", login: "alice" } });
  withWorkspaceWrite.mockImplementation(async (fn: (ws: Workspace) => unknown) =>
    fn(fixtureWorkspace()),
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
    );
  });

  it("rejects export when unsigned", async () => {
    auth.mockResolvedValue(null);
    await expect(exportOrgDataAction("org-1")).resolves.toEqual({
      error: "Sign in to export organization data.",
      json: null,
    });
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
      error: "Something went wrong. Reference: aaaaaaaabbbb",
      json: null,
    });
  });

  it("requires DELETE confirmation before deleting an organization", async () => {
    const formData = new FormData();
    formData.set("orgId", "org-1");
    formData.set("confirm", "nope");
    const result = await deleteOrgAction(emptyActionMessageState, formData);
    expect(result.error).toMatch(/Type DELETE/);
    expect(deleteOrganization).not.toHaveBeenCalled();
  });

  it("deletes the organization and switches the active org cookie", async () => {
    resolveActiveOrgId.mockReturnValue("org-personal");
    const formData = new FormData();
    formData.set("orgId", "org-1");
    formData.set("confirm", "DELETE");
    const result = await deleteOrgAction(emptyActionMessageState, formData);
    expect(result.error).toBeNull();
    expect(result.message).toMatch(/Evidence history was retained/);
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
    auth.mockResolvedValue(null);
    const form = new FormData();
    form.set("orgId", "org-1");
    await expect(switchOrgAction(form)).rejects.toThrow(/Sign in/);
  });

  it("rejects orgs the user does not belong to", async () => {
    const form = new FormData();
    form.set("orgId", "org-other");
    await expect(switchOrgAction(form)).rejects.toThrow(/not a member/);
  });
});

describe("createOrgAction", () => {
  it("creates an organization for a signed-in GitHub user", async () => {
    const form = new FormData();
    form.set("name", "New Co");
    const result = await createOrgAction(emptyActionMessageState, form);
    expect(result.error).toBeNull();
    expect(result.message).toMatch(/Created organization "New Co"/);
    expect(writeActiveOrgCookie).toHaveBeenCalled();
  });

  it("requires a name", async () => {
    const result = await createOrgAction(
      emptyActionMessageState,
      new FormData(),
    );
    expect(result.error).toMatch(/organization name/i);
  });

  it("requires GitHub sign-in", async () => {
    auth.mockResolvedValue({ user: { id: "user-1" } });
    const form = new FormData();
    form.set("name", "No Login");
    const result = await createOrgAction(emptyActionMessageState, form);
    expect(result.error).toMatch(/Sign in with GitHub/);
  });
});

describe("org member management actions", () => {
  it("invites a member", async () => {
    const form = new FormData();
    form.set("orgId", "org-1");
    form.set("githubLogin", "bob");
    form.set("role", "member");
    const result = await inviteOrgMemberAction(emptyActionMessageState, form);
    expect(result.message).toMatch(/Invited @bob as member/);
  });

  it("rejects owner role on invite", async () => {
    const form = new FormData();
    form.set("orgId", "org-1");
    form.set("githubLogin", "bob");
    form.set("role", "owner");
    const result = await inviteOrgMemberAction(emptyActionMessageState, form);
    expect(result.error).toMatch(/Choose a role/);
  });

  it("requires a GitHub username to invite", async () => {
    const form = new FormData();
    form.set("orgId", "org-1");
    form.set("role", "viewer");
    const result = await inviteOrgMemberAction(emptyActionMessageState, form);
    expect(result.error).toMatch(/GitHub username/);
  });

  it("removes a member", async () => {
    const member: OrgMembership = {
      id: "m-member",
      orgId: "org-1",
      role: "member",
      userId: "user-2",
      githubLogin: "bob",
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    const db = emptyDb([ownerMembership, member]);
    withWorkspaceWrite.mockImplementation(async (fn) => fn(fixtureWorkspace(db)));

    const form = new FormData();
    form.set("orgId", "org-1");
    form.set("membershipId", "m-member");
    const result = await removeOrgMemberAction(emptyActionMessageState, form);
    expect(result.message).toBe("Member removed.");
    expect(db.memberships.some((row) => row.id === "m-member")).toBe(false);
  });

  it("revokes a pending invite", async () => {
    const invite: OrgMembership = {
      id: "m-invite",
      orgId: "org-1",
      role: "viewer",
      githubLogin: "carol",
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    const db = emptyDb([ownerMembership, invite]);
    withWorkspaceWrite.mockImplementation(async (fn) => fn(fixtureWorkspace(db)));

    const form = new FormData();
    form.set("orgId", "org-1");
    form.set("membershipId", "m-invite");
    const result = await removeOrgMemberAction(emptyActionMessageState, form);
    expect(result.message).toBe("Invite revoked.");
  });

  it("changes a member role", async () => {
    const member: OrgMembership = {
      id: "m-member",
      orgId: "org-1",
      role: "member",
      userId: "user-2",
      githubLogin: "bob",
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    const db = emptyDb([ownerMembership, member]);
    withWorkspaceWrite.mockImplementation(async (fn) => fn(fixtureWorkspace(db)));

    const form = new FormData();
    form.set("orgId", "org-1");
    form.set("membershipId", "m-member");
    form.set("role", "admin");
    const result = await changeOrgMemberRoleAction(
      emptyActionMessageState,
      form,
    );
    expect(result.message).toBe("Role updated to admin.");
    expect(member.role).toBe("admin");
  });
});
