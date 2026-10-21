import "@/test-fixtures/register-action-workspace-mock";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { OrgMembership } from "@complyloop/analysis-core/contract/project-types";
import { PublicError } from "@complyloop/analysis-core/contract/public-error";

import { initialActionState } from "@/core/actions/action-state";
import {
  actionAuthMocks,
  actionWorkspaceMocks,
} from "@/test-fixtures/action-workspace-mocks";
import { testMembership } from "@/test-fixtures/membership";
import { testProject } from "@/test-fixtures/project";
import { testWorkspace } from "@/test-fixtures/workspace";

import type { ConnectWriteContext } from "../workspace/workspace-write";
import {
  connectGitHubRepoAction,
  disconnectGitHubRepoAction,
  openProjectAction,
} from "./connect";

const { getWorkspace, withConnectWrite } = actionWorkspaceMocks;
const writeActiveProjectCookie = vi.hoisted(() => vi.fn());
const setActiveProject = vi.hoisted(() => vi.fn());
const connectGitHubRepo = vi.hoisted(() => vi.fn());
const disconnectGitHubRepo = vi.hoisted(() => vi.fn());
const findConnectedGitHubProject = vi.hoisted(() => vi.fn());
const fetchGitHubRepo = vi.hoisted(() => vi.fn());
const resolveUserInstallationForRepo = vi.hoisted(() => vi.fn());
const createInstallationAccessToken = vi.hoisted(() => vi.fn());
const assertConnectRateLimit = vi.hoisted(() => vi.fn());
const refresh = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

vi.mock("../workspace/active-cookies", () => ({
  writeActiveProjectCookie: (...args: unknown[]) =>
    writeActiveProjectCookie(...args),
  readActiveOrgCookie: async () => "org-1",
}));

vi.mock("../workspace/project-visibility", async () => {
  const actual = await vi.importActual<
    typeof import("../workspace/project-visibility")
  >("../workspace/project-visibility");
  return {
    ...actual,
    setActiveProject: (...args: unknown[]) => setActiveProject(...args),
  };
});

vi.mock("../workspace/connect-github", () => ({
  assertGitHubRepoAssessable: async () => undefined,
  connectGitHubRepo: (...args: unknown[]) => connectGitHubRepo(...args),
  disconnectGitHubRepo: (...args: unknown[]) => disconnectGitHubRepo(...args),
  findConnectedGitHubProject: (...args: unknown[]) =>
    findConnectedGitHubProject(...args),
}));

vi.mock("../github/github-access", () => ({
  fetchGitHubRepo: (...args: unknown[]) => fetchGitHubRepo(...args),
}));

vi.mock("../github/github-app", () => ({
  resolveUserInstallationForRepo: (...args: unknown[]) =>
    resolveUserInstallationForRepo(...args),
  createInstallationAccessToken: (...args: unknown[]) =>
    createInstallationAccessToken(...args),
}));

vi.mock("../rate-limit", () => ({
  assertConnectRateLimit: (...args: unknown[]) =>
    assertConnectRateLimit(...args),
}));

vi.mock("../workspace/personal-org", () => ({
  ensurePersonalOrgProvisioned: async () => undefined,
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

function stubConnectWrite(membership: OrgMembership) {
  withConnectWrite.mockImplementation(
    async (
      _options: { activeProjectId: string | null },
      fn: (
        ctx: ConnectWriteContext,
      ) => Promise<{ result: unknown }> | { result: unknown },
    ) => {
      const db = workspaceFor(membership).db;
      const out = await fn({
        db,
        userId: membership.userId ?? "user-1",
        githubLogin: membership.githubLogin ?? null,
      });
      return out.result;
    },
  );
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("openProjectAction", () => {
  it("sets the active project and refreshes", async () => {
    const workspace = workspaceFor(ownerMembership);
    getWorkspace.mockResolvedValue(workspace);
    const form = new FormData();
    form.set("projectId", "p1");

    await openProjectAction(form);

    expect(setActiveProject).toHaveBeenCalledWith(
      {
        projects: workspace.projects,
        organizations: workspace.organizations,
        memberships: workspace.access.memberships,
      },
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
      initialActionState,
      new FormData(),
    );
    expect(result.ok ? null : result.message).toMatch(
      /Select a GitHub repository/,
    );
  });

  it("requires a signed-in session", async () => {
    actionAuthMocks.auth.mockResolvedValue(null);
    const form = new FormData();
    form.set("fullName", "acme/shop");
    const result = await connectGitHubRepoAction(initialActionState, form);
    expect(result.ok ? null : result.message).toMatch(/Sign in with GitHub/);
  });

  it("requires a GitHub access token", async () => {
    actionAuthMocks.auth.mockResolvedValue({ user: { id: "user-1" } });
    actionAuthMocks.getGitHubAccessToken.mockResolvedValue(null);
    assertConnectRateLimit.mockResolvedValue(undefined);
    const form = new FormData();
    form.set("fullName", "acme/shop");

    const result = await connectGitHubRepoAction(initialActionState, form);
    expect(result.ok ? null : result.message).toMatch(
      /GitHub access token missing/,
    );
  });

  it("denies viewers who cannot connect projects", async () => {
    actionAuthMocks.auth.mockResolvedValue({ user: { id: "user-1" } });
    actionAuthMocks.getGitHubAccessToken.mockResolvedValue("gho_token");
    assertConnectRateLimit.mockResolvedValue(undefined);
    resolveUserInstallationForRepo.mockResolvedValue(42);
    createInstallationAccessToken.mockResolvedValue("ghs_install");
    fetchGitHubRepo.mockResolvedValue({
      fullName: "acme/shop",
      defaultBranch: "main",
      private: false,
      canPush: true,
    });
    stubConnectWrite(viewerMembership);
    const form = new FormData();
    form.set("fullName", "acme/shop");

    const result = await connectGitHubRepoAction(initialActionState, form);
    expect(result.ok ? null : result.message).toMatch(/admin or owner/);
  });

  it("refuses a repository the user can only read", async () => {
    actionAuthMocks.auth.mockResolvedValue({ user: { id: "user-1" } });
    actionAuthMocks.getGitHubAccessToken.mockResolvedValue("gho_token");
    assertConnectRateLimit.mockResolvedValue(undefined);
    resolveUserInstallationForRepo.mockResolvedValue(42);
    createInstallationAccessToken.mockResolvedValue("ghs_install");
    fetchGitHubRepo.mockResolvedValue({
      fullName: "acme/shop",
      defaultBranch: "main",
      private: false,
      // Read-only collaborator: the App token must not open branches for them.
      canPush: false,
    });
    const form = new FormData();
    form.set("fullName", "acme/shop");

    const result = await connectGitHubRepoAction(initialActionState, form);
    expect(result.ok ? null : result.message).toMatch(/write access/);
    expect(connectGitHubRepo).not.toHaveBeenCalled();
  });

  it("surfaces already-connected errors", async () => {
    actionAuthMocks.auth.mockResolvedValue({ user: { id: "user-1" } });
    actionAuthMocks.getGitHubAccessToken.mockResolvedValue("gho_token");
    assertConnectRateLimit.mockResolvedValue(undefined);
    resolveUserInstallationForRepo.mockResolvedValue(42);
    createInstallationAccessToken.mockResolvedValue("ghs_install");
    fetchGitHubRepo.mockResolvedValue({
      fullName: "acme/shop",
      defaultBranch: "main",
      private: false,
      canPush: true,
    });
    findConnectedGitHubProject.mockReturnValue(project);
    stubConnectWrite(ownerMembership);
    const form = new FormData();
    form.set("fullName", "acme/shop");

    const result = await connectGitHubRepoAction(initialActionState, form);
    expect(result.ok ? null : result.message).toMatch(/already connected/);
  });

  it("connects a repository for an owner", async () => {
    actionAuthMocks.auth.mockResolvedValue({ user: { id: "user-1" } });
    actionAuthMocks.getGitHubAccessToken.mockResolvedValue("gho_token");
    assertConnectRateLimit.mockResolvedValue(undefined);
    resolveUserInstallationForRepo.mockResolvedValue(42);
    createInstallationAccessToken.mockResolvedValue("ghs_install");
    fetchGitHubRepo.mockResolvedValue({
      fullName: "acme/shop",
      defaultBranch: "main",
      private: false,
      canPush: true,
    });
    findConnectedGitHubProject.mockReturnValue(undefined);
    connectGitHubRepo.mockResolvedValue({
      project: { ...project, id: "p-new" },
      evidence: [{ kind: "project_connected" }],
    });
    stubConnectWrite(ownerMembership);
    const form = new FormData();
    form.set("fullName", "  acme/shop  ");

    const result = await connectGitHubRepoAction(initialActionState, form);

    expect(result).toEqual({
      ok: true,
      message: "Connected acme/shop.",
    });
    expect(resolveUserInstallationForRepo).toHaveBeenCalledWith({
      userAccessToken: "gho_token",
      fullName: "acme/shop",
      claimedInstallationId: undefined,
    });
    // The permission probe must use the signed-in user's token, not the
    // installation token (which reports the App's permissions).
    expect(fetchGitHubRepo).toHaveBeenCalledWith("gho_token", "acme/shop");
    expect(connectGitHubRepo).toHaveBeenCalled();
    expect(writeActiveProjectCookie).toHaveBeenCalledWith("p-new");
    expect(refresh).toHaveBeenCalled();
  });

  it("uses the claimed installation id when provided", async () => {
    actionAuthMocks.auth.mockResolvedValue({ user: { id: "user-1" } });
    actionAuthMocks.getGitHubAccessToken.mockResolvedValue("gho_user");
    assertConnectRateLimit.mockResolvedValue(undefined);
    resolveUserInstallationForRepo.mockResolvedValue(42);
    createInstallationAccessToken.mockResolvedValue("ghs_install");
    fetchGitHubRepo.mockResolvedValue({
      fullName: "acme/shop",
      defaultBranch: "main",
      private: true,
      canPush: true,
    });
    findConnectedGitHubProject.mockReturnValue(undefined);
    connectGitHubRepo.mockResolvedValue({
      project: { ...project, id: "p-app" },
      evidence: [{ kind: "project_connected" }],
    });
    stubConnectWrite(ownerMembership);
    const form = new FormData();
    form.set("fullName", "acme/shop");
    form.set("installationId", "42");

    const result = await connectGitHubRepoAction(initialActionState, form);

    expect(result.message).toMatch(/Connected/);
    expect(resolveUserInstallationForRepo).toHaveBeenCalledWith({
      userAccessToken: "gho_user",
      fullName: "acme/shop",
      claimedInstallationId: 42,
    });
    // The permission probe must use the signed-in user's token, not the
    // installation token (which reports the App's permissions).
    expect(fetchGitHubRepo).toHaveBeenCalledWith("gho_user", "acme/shop");
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
      initialActionState,
      new FormData(),
    );
    expect(result.ok ? null : result.message).toMatch(
      /Select a connected project/,
    );
  });

  it("requires a signed-in session", async () => {
    actionAuthMocks.auth.mockResolvedValue(null);
    const form = new FormData();
    form.set("projectId", "p1");
    const result = await disconnectGitHubRepoAction(initialActionState, form);
    expect(result.ok ? null : result.message).toMatch(/Sign in with GitHub/);
  });

  it("disconnects and updates the active project cookie", async () => {
    actionAuthMocks.auth.mockResolvedValue({ user: { id: "user-1" } });
    disconnectGitHubRepo.mockReturnValue({
      deleteProjectId: "p1",
      evidence: { kind: "project_disconnected" },
      nextProjectId: "p-next",
    });
    stubConnectWrite(ownerMembership);
    const form = new FormData();
    form.set("projectId", "p1");

    const result = await disconnectGitHubRepoAction(initialActionState, form);

    expect(result).toEqual({
      ok: true,
      message: "Disconnected acme/shop.",
    });
    expect(writeActiveProjectCookie).toHaveBeenCalledWith("p-next");
    expect(refresh).toHaveBeenCalled();
  });

  it("maps connect PublicError from disconnect into form state", async () => {
    actionAuthMocks.auth.mockResolvedValue({ user: { id: "user-1" } });
    withConnectWrite.mockImplementation(async () => {
      throw new PublicError(
        "Not allowed to disconnect this project.",
        "connect",
      );
    });
    const form = new FormData();
    form.set("projectId", "p1");

    const result = await disconnectGitHubRepoAction(initialActionState, form);
    expect(result.ok ? null : result.message).toMatch(
      /Not allowed to disconnect/,
    );
  });
});
