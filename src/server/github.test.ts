import { afterEach, describe, expect, it, vi } from "vitest";
import type { Project } from "@complyloop/analysis-core/contract/project-types";
import {
  fetchGitHubRepo,
  listGitHubRepos,
  resolveProjectGitHubToken,
} from "./github-access";

const createInstallationAccessToken = vi.hoisted(() => vi.fn());
const isGitHubAppConfigured = vi.hoisted(() => vi.fn());
const listReposViaInstallations = vi.hoisted(() => vi.fn());

vi.mock("./github-app", () => ({
  createInstallationAccessToken: (...args: unknown[]) =>
    createInstallationAccessToken(...args),
  isGitHubAppConfigured: () => isGitHubAppConfigured(),
  listReposViaInstallations: (...args: unknown[]) =>
    listReposViaInstallations(...args),
}));

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("listGitHubRepos", () => {
  it("delegates to GitHub App installations for the user", async () => {
    listReposViaInstallations.mockResolvedValue([
      {
        fullName: "acme/shop",
        name: "shop",
        description: "Storefront",
        private: true,
        defaultBranch: "main",
        updatedAt: "2026-08-01T00:00:00Z",
        htmlUrl: "https://github.com/acme/shop",
        cloneUrl: "https://github.com/acme/shop.git",
        installationId: 42,
      },
    ]);

    const repos = await listGitHubRepos({
      accessToken: "user-token",
      q: "shop",
    });

    expect(listReposViaInstallations).toHaveBeenCalledWith({
      userAccessToken: "user-token",
      perPage: undefined,
      q: "shop",
    });
    expect(repos).toHaveLength(1);
    expect(repos[0].fullName).toBe("acme/shop");
    expect(repos[0].installationId).toBe(42);
  });
});

describe("fetchGitHubRepo", () => {
  it("maps a single repository payload", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          full_name: "acme/shop",
          name: "shop",
          description: "Storefront",
          private: true,
          default_branch: "main",
          updated_at: "2026-08-01T00:00:00Z",
          html_url: "https://github.com/acme/shop",
          clone_url: "https://github.com/acme/shop.git",
        }),
      ),
    );

    const repo = await fetchGitHubRepo("token", "acme/shop");
    expect(repo.fullName).toBe("acme/shop");
    expect(repo.private).toBe(true);
  });

  it("throws ConnectError when GitHub rejects the lookup", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({ message: "Not Found" }, { status: 404 }),
      ),
    );

    await expect(fetchGitHubRepo("token", "acme/missing")).rejects.toThrow(
      /Could not load repository/,
    );
  });
});

describe("resolveProjectGitHubToken", () => {
  it("mints an installation token when the project has an installation", async () => {
    isGitHubAppConfigured.mockReturnValue(true);
    createInstallationAccessToken.mockResolvedValue("ghs_install");
    const project = {
      orgId: "org-1",
      ownerUserId: "user-1",
      github: {
        fullName: "acme/shop",
        defaultBranch: "main",
        private: true,
        installationId: 42,
      },
    } as Project;

    await expect(resolveProjectGitHubToken(project)).resolves.toBe("ghs_install");
    expect(createInstallationAccessToken).toHaveBeenCalledWith(42);
  });

  it("returns null when the project has no installation id", async () => {
    isGitHubAppConfigured.mockReturnValue(true);
    const project = {
      orgId: "org-1",
      ownerUserId: "user-1",
      github: {
        fullName: "acme/shop",
        defaultBranch: "main",
        private: true,
      },
    } as Project;

    await expect(resolveProjectGitHubToken(project)).resolves.toBeNull();
    expect(createInstallationAccessToken).not.toHaveBeenCalled();
  });

  it("returns null when the App is not configured", async () => {
    isGitHubAppConfigured.mockReturnValue(false);
    const project = {
      orgId: "org-1",
      ownerUserId: "user-1",
      github: {
        fullName: "acme/shop",
        defaultBranch: "main",
        private: false,
        installationId: 42,
      },
    } as Project;

    await expect(resolveProjectGitHubToken(project)).resolves.toBeNull();
    expect(createInstallationAccessToken).not.toHaveBeenCalled();
  });
});
