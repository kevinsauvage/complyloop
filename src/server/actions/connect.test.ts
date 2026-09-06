import "@/test-fixtures/register-action-workspace-mock";
import { afterEach, describe, expect, it, vi } from "vitest";
import { actionAuthMocks, actionWorkspaceMocks } from "@/test-fixtures/action-workspace-mocks";
import type { OrgMembership } from "@complyloop/analysis-core/contract/project-types";
import { testMembership } from "@/test-fixtures/membership";
import { testProject } from "@/test-fixtures/project";
import { testWorkspace } from "@/test-fixtures/workspace";
import { ConnectError } from "../connect-error";
import { emptyActionMessageState } from "../action-state";
import {
  connectGitHubRepoAction,
  disconnectGitHubRepoAction,
  switchProjectAction,
} from "./connect";

const { getWorkspace } = actionWorkspaceMocks;
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
const loadWorkspaceDb = vi.hoisted(() => vi.fn());
const transaction = vi.hoisted(() => vi.fn());
const listOrgIdsForUser = vi.hoisted(() => vi.fn());
const listOrganizationsForUser = vi.hoisted(() => vi.fn());
const listMembershipsForOrgs = vi.hoisted(() => vi.fn());

vi.mock("../active-cookies", () => ({
  writeActiveProjectCookie: (...args: unknown[]) =>
    writeActiveProjectCookie(...args),
  readActiveOrgCookie: async () => "org-1",
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

vi.mock("@complyloop/db/client", () => ({
  getDrizzle: async () => ({ transaction }),
}));

vi.mock("@complyloop/db/workspace-load", () => ({
  loadWorkspaceDb: (...args: unknown[]) => loadWorkspaceDb(...args),
}));

vi.mock("@complyloop/db/repo/projects", () => ({
  insertProject: vi.fn(),
  deleteProject: vi.fn(),
}));

vi.mock("@complyloop/db/repo/evidence", () => ({
  insertEvidence: vi.fn(),
}));

vi.mock("@complyloop/db/postgres-queries", () => ({
  listOrgIdsForUser: (...args: unknown[]) => listOrgIdsForUser(...args),
}));

// ensurePersonalOrgProvisioned (read path) inspects orgs/memberships alone; the
// connect action's own full workspace load is mocked separately via loadWorkspaceDb.
vi.mock("@complyloop/db/repo/orgs", async () => {
  const actual = await vi.importActual<typeof import("@complyloop/db/repo/orgs")>(
    "@complyloop/db/repo/orgs",
  );
  return {
    ...actual,
    listOrganizationsForUser: (...args: unknown[]) =>
      listOrganizationsForUser(...args),
    listMembershipsForOrgs: (...args: unknown[]) =>
      listMembershipsForOrgs(...args),
  };
});

const project = testProject({
  orgId: "org-1",
  ownerUserId: "user-1",
  github: {
    fullName: "acme/shop",
    defaultBranch: "main",
    private: false,
  },
});

const ownerMembership = testMembership("owner", {
  id: "m-owner",
  githubLogin: "alice",
});

const viewerMembership = testMembership("viewer", {
  id: "m-viewer",
  githubLogin: "alice",
});

function workspaceFor(membership: OrgMembership) {
  return testWorkspace({
    role: membership.role,
    userId: membership.userId ?? "user-1",
    project,
    findings: [],
    remediations: [],
    db: { memberships: [membership] },
  });
}

afterEach(() => {
  vi.clearAllMocks();
  transaction.mockImplementation(async (fn: (tx: object) => unknown) => fn({}));
  // Personal org already exists for user-1 (owner) → provisioning short-circuits.
  const provisioned = testWorkspace({
    role: "owner",
    userId: "user-1",
    project,
    findings: [],
    remediations: [],
  }).db;
  listOrgIdsForUser.mockResolvedValue(
    provisioned.organizations.map((org) => org.id),
  );
  listOrganizationsForUser.mockResolvedValue(provisioned.organizations);
  listMembershipsForOrgs.mockResolvedValue(provisioned.memberships);
});

describe("switchProjectAction", () => {
  it("sets the active project and refreshes", async () => {
    const workspace = workspaceFor(ownerMembership);
    getWorkspace.mockResolvedValue(workspace);
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
    actionAuthMocks.auth.mockResolvedValue(null);
    const form = new FormData();
    form.set("fullName", "acme/shop");
    const result = await connectGitHubRepoAction(
      emptyActionMessageState,
      form,
    );
    expect(result.error).toMatch(/Sign in with GitHub/);
  });

  it("requires a GitHub access token", async () => {
    actionAuthMocks.auth.mockResolvedValue({ user: { id: "user-1" } });
    actionAuthMocks.getGitHubAccessToken.mockResolvedValue(null);
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
    actionAuthMocks.auth.mockResolvedValue({ user: { id: "user-1" } });
    actionAuthMocks.getGitHubAccessToken.mockResolvedValue("gho_token");
    assertConnectRateLimit.mockResolvedValue(undefined);
    isGitHubAppConfigured.mockReturnValue(false);
    fetchGitHubRepo.mockResolvedValue({
      fullName: "acme/shop",
      defaultBranch: "main",
      private: false,
    });
    loadWorkspaceDb.mockResolvedValue(workspaceFor(viewerMembership).db);
    const form = new FormData();
    form.set("fullName", "acme/shop");

    const result = await connectGitHubRepoAction(
      emptyActionMessageState,
      form,
    );
    expect(result.error).toMatch(/admin or owner/);
  });

  it("surfaces already-connected errors", async () => {
    actionAuthMocks.auth.mockResolvedValue({ user: { id: "user-1" } });
    actionAuthMocks.getGitHubAccessToken.mockResolvedValue("gho_token");
    assertConnectRateLimit.mockResolvedValue(undefined);
    isGitHubAppConfigured.mockReturnValue(false);
    fetchGitHubRepo.mockResolvedValue({
      fullName: "acme/shop",
      defaultBranch: "main",
      private: false,
    });
    findConnectedGitHubProject.mockReturnValue(project);
    loadWorkspaceDb.mockResolvedValue(workspaceFor(ownerMembership).db);
    const form = new FormData();
    form.set("fullName", "acme/shop");

    const result = await connectGitHubRepoAction(
      emptyActionMessageState,
      form,
    );
    expect(result.error).toMatch(/already connected/);
  });

  it("connects a repository for an owner", async () => {
    actionAuthMocks.auth.mockResolvedValue({ user: { id: "user-1" } });
    actionAuthMocks.getGitHubAccessToken.mockResolvedValue("gho_token");
    assertConnectRateLimit.mockResolvedValue(undefined);
    isGitHubAppConfigured.mockReturnValue(false);
    fetchGitHubRepo.mockResolvedValue({
      fullName: "acme/shop",
      defaultBranch: "main",
      private: false,
    });
    findConnectedGitHubProject.mockReturnValue(undefined);
    connectGitHubRepo.mockResolvedValue({ ...project, id: "p-new" });
    loadWorkspaceDb.mockResolvedValue(workspaceFor(ownerMembership).db);
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
    actionAuthMocks.auth.mockResolvedValue({ user: { id: "user-1" } });
    actionAuthMocks.getGitHubAccessToken.mockResolvedValue("gho_user");
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
    loadWorkspaceDb.mockResolvedValue(workspaceFor(ownerMembership).db);
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
    actionAuthMocks.auth.mockResolvedValue(null);
    const form = new FormData();
    form.set("projectId", "p1");
    const result = await disconnectGitHubRepoAction(
      emptyActionMessageState,
      form,
    );
    expect(result.error).toMatch(/Sign in with GitHub/);
  });

  it("disconnects and updates the active project cookie", async () => {
    actionAuthMocks.auth.mockResolvedValue({ user: { id: "user-1" } });
    disconnectGitHubRepo.mockReturnValue("p-next");
    loadWorkspaceDb.mockResolvedValue(workspaceFor(ownerMembership).db);
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
    actionAuthMocks.auth.mockResolvedValue({ user: { id: "user-1" } });
    transaction.mockImplementation(async () => {
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
