import { afterEach, describe, expect, it, vi } from "vitest";
import type { OrgMembership } from "@/core/project-types";
import { testProject } from "@/test-fixtures/project";
import { ConnectError } from "../connect-error";
import { emptyActionMessageState } from "../action-state";
import type { Db } from "../db";
import type { Workspace } from "../workspace";
import {
  connectGitHubRepoAction,
  disconnectGitHubRepoAction,
  switchProjectAction,
} from "./connect";

const auth = vi.hoisted(() => vi.fn());
const getGitHubAccessToken = vi.hoisted(() => vi.fn());
const withWorkspaceWrite = vi.hoisted(() => vi.fn());
const writeActiveProjectCookie = vi.hoisted(() => vi.fn());
const setActiveProject = vi.hoisted(() => vi.fn());
const connectGitHubRepo = vi.hoisted(() => vi.fn());
const disconnectGitHubRepo = vi.hoisted(() => vi.fn());
const findConnectedGitHubProject = vi.hoisted(() => vi.fn());
const fetchGitHubRepo = vi.hoisted(() => vi.fn());
const isGitHubAppConfigured = vi.hoisted(() => vi.fn());
const resolveUserInstallationForRepo = vi.hoisted(() => vi.fn());
const createInstallationAccessToken = vi.hoisted(() => vi.fn());
const assertConnectRateLimit = vi.hoisted(() => vi.fn());
const refresh = vi.hoisted(() => vi.fn());

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/auth", () => ({
  auth: () => auth(),
  getGitHubAccessToken: () => getGitHubAccessToken(),
}));

vi.mock("../workspace", async () => {
  const actual = await vi.importActual<typeof import("../workspace")>(
    "../workspace",
  );
  return {
    ...actual,
    withWorkspaceWrite: (fn: (workspace: Workspace) => unknown) =>
      withWorkspaceWrite(fn),
  };
});

vi.mock("../active-cookies", () => ({
  writeActiveProjectCookie: (...args: unknown[]) =>
    writeActiveProjectCookie(...args),
}));

vi.mock("../connect-active", () => ({
  setActiveProject: (...args: unknown[]) => setActiveProject(...args),
}));

vi.mock("../connect-github", () => ({
  connectGitHubRepo: (...args: unknown[]) => connectGitHubRepo(...args),
  disconnectGitHubRepo: (...args: unknown[]) => disconnectGitHubRepo(...args),
  findConnectedGitHubProject: (...args: unknown[]) =>
    findConnectedGitHubProject(...args),
}));

vi.mock("../github", () => ({
  fetchGitHubRepo: (...args: unknown[]) => fetchGitHubRepo(...args),
}));

vi.mock("../github-app", () => ({
  isGitHubAppConfigured: () => isGitHubAppConfigured(),
  resolveUserInstallationForRepo: (...args: unknown[]) =>
    resolveUserInstallationForRepo(...args),
  createInstallationAccessToken: (...args: unknown[]) =>
    createInstallationAccessToken(...args),
}));

vi.mock("../rate-limit", () => ({
  assertConnectRateLimit: (...args: unknown[]) =>
    assertConnectRateLimit(...args),
}));

vi.mock("./shared", () => ({
  refresh: () => refresh(),
}));

const project = testProject({
  orgId: "org-1",
  ownerUserId: "user-1",
  github: {
    fullName: "acme/shop",
    defaultBranch: "main",
    private: false,
  },
});

const ownerMembership: OrgMembership = {
  id: "m-owner",
  orgId: "org-1",
  role: "owner",
  userId: "user-1",
  githubLogin: "alice",
  createdAt: "2026-01-01T00:00:00.000Z",
};

const viewerMembership: OrgMembership = {
  ...ownerMembership,
  id: "m-viewer",
  role: "viewer",
};

function workspaceFor(membership: OrgMembership): Workspace {
  const db = {
    frameworks: [],
    controls: [],
    organizations: [
      { id: "org-1", name: "Acme", slug: "acme", createdAt: "" },
    ],
    memberships: [membership],
    projects: [project],
    requirements: [],
    assessments: [],
    findings: [],
    remediations: [],
    evidence: [],
    alerts: [],
  } as Db;

  return {
    db,
    project,
    userId: membership.userId ?? null,
    githubLogin: membership.githubLogin,
    access: {
      userId: membership.userId ?? null,
      githubLogin: membership.githubLogin,
      organizations: db.organizations,
      memberships: db.memberships,
    },
    visibleProjects: [project],
    organizations: db.organizations,
    activeOrgId: "org-1",
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("switchProjectAction", () => {
  it("sets the active project and refreshes", async () => {
    const workspace = workspaceFor(ownerMembership);
    withWorkspaceWrite.mockImplementation(async (fn) => fn(workspace));
    const form = new FormData();
    form.set("projectId", "p1");

    await switchProjectAction(form);

    expect(setActiveProject).toHaveBeenCalledWith(
      workspace.db,
      "p1",
      "user-1",
    );
    expect(writeActiveProjectCookie).toHaveBeenCalledWith("p1");
    expect(refresh).toHaveBeenCalled();
  });
});

describe("connectGitHubRepoAction", () => {
  it("requires a repository name", async () => {
    const result = await connectGitHubRepoAction(
      emptyActionMessageState,
      new FormData(),
    );
    expect(result.error).toMatch(/Select a GitHub repository/);
  });

  it("requires a signed-in session", async () => {
    auth.mockResolvedValue(null);
    const form = new FormData();
    form.set("fullName", "acme/shop");
    const result = await connectGitHubRepoAction(
      emptyActionMessageState,
      form,
    );
    expect(result.error).toMatch(/Sign in with GitHub/);
  });

  it("requires a GitHub access token", async () => {
    auth.mockResolvedValue({ user: { id: "user-1" } });
    getGitHubAccessToken.mockResolvedValue(null);
    assertConnectRateLimit.mockResolvedValue(undefined);
    const form = new FormData();
    form.set("fullName", "acme/shop");

    const result = await connectGitHubRepoAction(
      emptyActionMessageState,
      form,
    );
    expect(result.error).toMatch(/GitHub access token missing/);
  });

  it("denies viewers who cannot connect projects", async () => {
    auth.mockResolvedValue({ user: { id: "user-1" } });
    getGitHubAccessToken.mockResolvedValue("gho_token");
    assertConnectRateLimit.mockResolvedValue(undefined);
    isGitHubAppConfigured.mockReturnValue(false);
    fetchGitHubRepo.mockResolvedValue({
      fullName: "acme/shop",
      defaultBranch: "main",
      private: false,
    });
    withWorkspaceWrite.mockImplementation(async (fn) =>
      fn(workspaceFor(viewerMembership)),
    );
    const form = new FormData();
    form.set("fullName", "acme/shop");

    const result = await connectGitHubRepoAction(
      emptyActionMessageState,
      form,
    );
    expect(result.error).toMatch(/admin or owner/);
  });

  it("surfaces already-connected errors", async () => {
    auth.mockResolvedValue({ user: { id: "user-1" } });
    getGitHubAccessToken.mockResolvedValue("gho_token");
    assertConnectRateLimit.mockResolvedValue(undefined);
    isGitHubAppConfigured.mockReturnValue(false);
    fetchGitHubRepo.mockResolvedValue({
      fullName: "acme/shop",
      defaultBranch: "main",
      private: false,
    });
    findConnectedGitHubProject.mockReturnValue(project);
    withWorkspaceWrite.mockImplementation(async (fn) =>
      fn(workspaceFor(ownerMembership)),
    );
    const form = new FormData();
    form.set("fullName", "acme/shop");

    const result = await connectGitHubRepoAction(
      emptyActionMessageState,
      form,
    );
    expect(result.error).toMatch(/already connected/);
  });

  it("connects a repository for an owner", async () => {
    auth.mockResolvedValue({ user: { id: "user-1" } });
    getGitHubAccessToken.mockResolvedValue("gho_token");
    assertConnectRateLimit.mockResolvedValue(undefined);
    isGitHubAppConfigured.mockReturnValue(false);
    fetchGitHubRepo.mockResolvedValue({
      fullName: "acme/shop",
      defaultBranch: "main",
      private: false,
    });
    findConnectedGitHubProject.mockReturnValue(undefined);
    connectGitHubRepo.mockResolvedValue({ ...project, id: "p-new" });
    withWorkspaceWrite.mockImplementation(async (fn) =>
      fn(workspaceFor(ownerMembership)),
    );
    const form = new FormData();
    form.set("fullName", "  acme/shop  ");

    const result = await connectGitHubRepoAction(
      emptyActionMessageState,
      form,
    );

    expect(result).toEqual({
      error: null,
      message: "Connected acme/shop.",
    });
    expect(connectGitHubRepo).toHaveBeenCalled();
    expect(writeActiveProjectCookie).toHaveBeenCalledWith("p-new");
    expect(refresh).toHaveBeenCalled();
  });

  it("uses an installation token when the GitHub App is configured", async () => {
    auth.mockResolvedValue({ user: { id: "user-1" } });
    getGitHubAccessToken.mockResolvedValue("gho_user");
    assertConnectRateLimit.mockResolvedValue(undefined);
    isGitHubAppConfigured.mockReturnValue(true);
    resolveUserInstallationForRepo.mockResolvedValue(42);
    createInstallationAccessToken.mockResolvedValue("ghs_install");
    fetchGitHubRepo.mockResolvedValue({
      fullName: "acme/shop",
      defaultBranch: "main",
      private: true,
    });
    findConnectedGitHubProject.mockReturnValue(undefined);
    connectGitHubRepo.mockResolvedValue({ ...project, id: "p-app" });
    withWorkspaceWrite.mockImplementation(async (fn) =>
      fn(workspaceFor(ownerMembership)),
    );
    const form = new FormData();
    form.set("fullName", "acme/shop");
    form.set("installationId", "42");

    const result = await connectGitHubRepoAction(
      emptyActionMessageState,
      form,
    );

    expect(result.message).toMatch(/Connected/);
    expect(resolveUserInstallationForRepo).toHaveBeenCalledWith({
      userAccessToken: "gho_user",
      fullName: "acme/shop",
      claimedInstallationId: 42,
    });
    expect(fetchGitHubRepo).toHaveBeenCalledWith("ghs_install", "acme/shop");
    expect(connectGitHubRepo).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        accessToken: "ghs_install",
        installationId: 42,
      }),
    );
  });
});

describe("disconnectGitHubRepoAction", () => {
  it("requires a project id", async () => {
    const result = await disconnectGitHubRepoAction(
      emptyActionMessageState,
      new FormData(),
    );
    expect(result.error).toMatch(/Select a connected project/);
  });

  it("requires a signed-in session", async () => {
    auth.mockResolvedValue(null);
    const form = new FormData();
    form.set("projectId", "p1");
    const result = await disconnectGitHubRepoAction(
      emptyActionMessageState,
      form,
    );
    expect(result.error).toMatch(/Sign in with GitHub/);
  });

  it("disconnects and updates the active project cookie", async () => {
    auth.mockResolvedValue({ user: { id: "user-1" } });
    disconnectGitHubRepo.mockReturnValue("p-next");
    withWorkspaceWrite.mockImplementation(async (fn) =>
      fn(workspaceFor(ownerMembership)),
    );
    const form = new FormData();
    form.set("projectId", "p1");

    const result = await disconnectGitHubRepoAction(
      emptyActionMessageState,
      form,
    );

    expect(result).toEqual({
      error: null,
      message: "Disconnected acme/shop.",
    });
    expect(writeActiveProjectCookie).toHaveBeenCalledWith("p-next");
    expect(refresh).toHaveBeenCalled();
  });

  it("maps ConnectError from disconnect into form state", async () => {
    auth.mockResolvedValue({ user: { id: "user-1" } });
    withWorkspaceWrite.mockImplementation(async () => {
      throw new ConnectError("Not allowed to disconnect this project.");
    });
    const form = new FormData();
    form.set("projectId", "p1");

    const result = await disconnectGitHubRepoAction(
      emptyActionMessageState,
      form,
    );
    expect(result.error).toMatch(/Not allowed to disconnect/);
  });
});
