import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PublicError } from "@/core/public-error";
import type { Organization, Project } from "@/core/project-types";
import { emptyActionMessageState } from "./action-state";
import type { Db } from "./db";
import type { Workspace } from "./workspace";

const auth = vi.hoisted(() => vi.fn());
const getWorkspace = vi.hoisted(() => vi.fn());
const withWorkspaceWrite = vi.hoisted(() => vi.fn());
const exportOrgData = vi.hoisted(() => vi.fn());
const deleteOrganization = vi.hoisted(() => vi.fn());
const resolveActiveOrgId = vi.hoisted(() => vi.fn());
const writeActiveOrgCookie = vi.hoisted(() => vi.fn());
const refresh = vi.hoisted(() => vi.fn());

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/auth", () => ({
  auth: () => auth(),
}));

vi.mock("./workspace", async () => {
  const actual = await vi.importActual<typeof import("./workspace")>(
    "./workspace",
  );
  return {
    ...actual,
    getWorkspace: () => getWorkspace(),
    withWorkspaceWrite: (fn: (workspace: Workspace) => unknown) =>
      withWorkspaceWrite(fn),
  };
});

vi.mock("./orgs", async () => {
  const actual = await vi.importActual<typeof import("./orgs")>("./orgs");
  return {
    ...actual,
    exportOrgData: (...args: unknown[]) => exportOrgData(...args),
    deleteOrganization: (...args: unknown[]) => deleteOrganization(...args),
    resolveActiveOrgId: (...args: unknown[]) => resolveActiveOrgId(...args),
  };
});

vi.mock("./active-cookies", () => ({
  writeActiveOrgCookie: (...args: unknown[]) => writeActiveOrgCookie(...args),
  writeActiveProjectCookie: vi.fn(),
  readActiveOrgCookie: vi.fn(),
  readActiveProjectCookie: vi.fn(),
}));

vi.mock("./actions/shared", () => ({
  refresh: () => refresh(),
}));

import { deleteOrgAction, exportOrgDataAction } from "./actions/org";

const org: Organization = {
  id: "org-1",
  name: "Acme",
  slug: "acme",
  createdAt: "2026-01-01T00:00:00.000Z",
};

const project: Project = {
  id: "p1",
  name: "Shop",
  source: "github",
  orgId: "org-1",
  ownerUserId: "user-1",
  createdAt: "2026-01-01T00:00:00.000Z",
};

function emptyDb(): Db {
  return {
    frameworks: [],
    controls: [],
    organizations: [org],
    memberships: [],
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
      memberships: [],
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
