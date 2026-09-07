import { afterEach, describe, expect, it, vi } from "vitest";
import type { Project } from "@complyloop/analysis-core/contract/project-types";
import {
  fetchGitHubRepo,
  listGitHubRepos,
  resolveProjectGitHubToken,
} from "./github";

const createInstallationAccessToken = vi.hoisted(() => vi.fn());
const getStoredGitHubToken = vi.hoisted(() => vi.fn());
const isGitHubAppConfigured = vi.hoisted(() => vi.fn());

vi.mock("./github-app", () => ({
  createInstallationAccessToken: (...args: unknown[]) =>
    createInstallationAccessToken(...args),
  isGitHubAppConfigured: () => isGitHubAppConfigured(),
}));

vi.mock("./github-tokens", () => ({
  getStoredGitHubToken: (...args: unknown[]) => getStoredGitHubToken(...args),
}));

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("listGitHubRepos", () => {
  it("maps GitHub API payloads and filters by query", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json([
          {
            full_name: "acme/shop",
            name: "shop",
            description: "Storefront",
            private: true,
            default_branch: "main",
            updated_at: "2026-08-01T00:00:00Z",
            html_url: "https://github.com/acme/shop",
            clone_url: "https://github.com/acme/shop.git",
          },
          {
            full_name: "acme/docs",
            name: "docs",
            description: "Internal docs",
            private: false,
            default_branch: "main",
            updated_at: "2026-07-01T00:00:00Z",
            html_url: "https://github.com/acme/docs",
            clone_url: "https://github.com/acme/docs.git",
          },
        ]),
      ),
    );

    const repos = await listGitHubRepos({
      accessToken: "token",
      q: "shop",
    });
    expect(repos).toHaveLength(1);
    expect(repos[0].fullName).toBe("acme/shop");
    expect(repos[0].private).toBe(true);
  });

  it("throws ConnectError when GitHub responds with an error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({ message: "Bad credentials" }, { status: 401 }),
      ),
    );

    await expect(
      listGitHubRepos({ accessToken: "bad" }),
    ).rejects.toThrow(/GitHub API error/);
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
  it("prefers an installation token when the App is configured", async () => {
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
    expect(getStoredGitHubToken).not.toHaveBeenCalled();
  });

  it("falls back to the stored owner token without an installation", async () => {
    isGitHubAppConfigured.mockReturnValue(false);
    getStoredGitHubToken.mockResolvedValue("gho_user");
    const project = {
      orgId: "org-1",
      ownerUserId: "user-1",
      github: {
        fullName: "acme/shop",
        defaultBranch: "main",
        private: false,
      },
    } as Project;

    await expect(resolveProjectGitHubToken(project)).resolves.toBe("gho_user");
    expect(getStoredGitHubToken).toHaveBeenCalledWith("user-1");
  });

  it("prefers an explicit session access token", async () => {
    isGitHubAppConfigured.mockReturnValue(false);
    const project = {
      orgId: "org-1",
      ownerUserId: "user-1",
      github: {
        fullName: "acme/shop",
        defaultBranch: "main",
        private: false,
      },
    } as Project;

    await expect(
      resolveProjectGitHubToken(project, {
        sessionAccessToken: "gho_live",
      }),
    ).resolves.toBe("gho_live");
    expect(getStoredGitHubToken).not.toHaveBeenCalled();
  });
});
