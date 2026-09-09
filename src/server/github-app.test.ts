import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertProductionGitHubApp,
  githubAppInstallUrl,
  isGitHubAppConfigured,
  resolveUserInstallationForRepo,
} from "./github-app";

const paginate = vi.fn();

vi.mock("@octokit/rest", () => ({
  Octokit: vi.fn(function MockOctokit(this: {
    paginate: typeof paginate;
    rest: {
      apps: {
        listInstallationsForAuthenticatedUser: ReturnType<typeof vi.fn>;
        listInstallationReposForAuthenticatedUser: ReturnType<typeof vi.fn>;
      };
    };
  }) {
    this.paginate = paginate;
    this.rest = {
      apps: {
        listInstallationsForAuthenticatedUser: vi.fn(),
        listInstallationReposForAuthenticatedUser: vi.fn(),
      },
    };
  }),
}));

afterEach(() => {
  vi.unstubAllEnvs();
  paginate.mockReset();
});

describe("GitHub App configuration", () => {
  it("detects when App credentials are present", () => {
    vi.stubEnv("GITHUB_APP_ID", "12345");
    vi.stubEnv(
      "GITHUB_APP_PRIVATE_KEY",
      "-----BEGIN RSA PRIVATE KEY-----\\nabc\\n-----END RSA PRIVATE KEY-----",
    );
    expect(isGitHubAppConfigured()).toBe(true);
  });

  it("is not configured without App credentials", () => {
    vi.stubEnv("GITHUB_APP_ID", "");
    vi.stubEnv("GITHUB_APP_PRIVATE_KEY", "");
    expect(isGitHubAppConfigured()).toBe(false);
  });

  it("builds an App install URL from GITHUB_APP_SLUG", () => {
    vi.stubEnv("GITHUB_APP_SLUG", "complyloop");
    expect(githubAppInstallUrl()).toBe(
      "https://github.com/apps/complyloop/installations/new",
    );
  });

  it("has no install URL when the slug is unset", () => {
    vi.stubEnv("GITHUB_APP_SLUG", "");
    expect(githubAppInstallUrl()).toBeUndefined();
  });

  it("requires App credentials in production when GitHub auth is configured", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PHASE", "");
    vi.stubEnv("E2E_AUTH_ENABLED", "");
    vi.stubEnv("AUTH_SECRET", "secret");
    vi.stubEnv("AUTH_GITHUB_ID", "client");
    vi.stubEnv("AUTH_GITHUB_SECRET", "client-secret");
    vi.stubEnv("GITHUB_APP_ID", "");
    vi.stubEnv("GITHUB_APP_PRIVATE_KEY", "");
    expect(() => assertProductionGitHubApp()).toThrow(/GITHUB_APP_ID/);
  });

  it("skips App enforcement under the e2e harness", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PHASE", "");
    vi.stubEnv("E2E_AUTH_ENABLED", "1");
    vi.stubEnv("AUTH_SECRET", "secret");
    vi.stubEnv("AUTH_GITHUB_ID", "client");
    vi.stubEnv("AUTH_GITHUB_SECRET", "client-secret");
    vi.stubEnv("GITHUB_APP_ID", "");
    vi.stubEnv("GITHUB_APP_PRIVATE_KEY", "");
    expect(() => assertProductionGitHubApp()).not.toThrow();
  });

  it("allows production when App credentials are set", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PHASE", "");
    vi.stubEnv("AUTH_SECRET", "secret");
    vi.stubEnv("AUTH_GITHUB_ID", "client");
    vi.stubEnv("AUTH_GITHUB_SECRET", "client-secret");
    vi.stubEnv("GITHUB_APP_ID", "99");
    vi.stubEnv("GITHUB_APP_PRIVATE_KEY", "key");
    expect(() => assertProductionGitHubApp()).not.toThrow();
  });
});

describe("resolveUserInstallationForRepo", () => {
  it("rejects a claimed installation that is not on the user account", async () => {
    paginate.mockResolvedValueOnce([{ id: 11 }, { id: 22 }]);

    await expect(
      resolveUserInstallationForRepo({
        userAccessToken: "user-token",
        fullName: "acme/shop",
        claimedInstallationId: 999,
      }),
    ).rejects.toThrow(/not available on your account/);
  });

  it("accepts a claimed installation that exposes the repo", async () => {
    paginate
      .mockResolvedValueOnce([{ id: 11 }, { id: 22 }])
      .mockResolvedValueOnce([
        { full_name: "Acme/Shop" },
        { full_name: "acme/other" },
      ]);

    await expect(
      resolveUserInstallationForRepo({
        userAccessToken: "user-token",
        fullName: "acme/shop",
        claimedInstallationId: 22,
      }),
    ).resolves.toBe(22);
  });

  it("rejects a claimed installation that does not include the repo", async () => {
    paginate
      .mockResolvedValueOnce([{ id: 11 }])
      .mockResolvedValueOnce([{ full_name: "acme/other" }]);

    await expect(
      resolveUserInstallationForRepo({
        userAccessToken: "user-token",
        fullName: "acme/shop",
        claimedInstallationId: 11,
      }),
    ).rejects.toThrow(/not accessible via the selected/);
  });

  it("resolves the installation by scanning when no claim is provided", async () => {
    paginate
      .mockResolvedValueOnce([{ id: 11 }, { id: 22 }])
      .mockResolvedValueOnce([{ full_name: "acme/other" }])
      .mockResolvedValueOnce([{ full_name: "acme/shop" }]);

    await expect(
      resolveUserInstallationForRepo({
        userAccessToken: "user-token",
        fullName: "Acme/Shop",
      }),
    ).resolves.toBe(22);
  });

  it("fails when the repo is not on any user installation", async () => {
    paginate
      .mockResolvedValueOnce([{ id: 11 }])
      .mockResolvedValueOnce([{ full_name: "acme/other" }]);

    await expect(
      resolveUserInstallationForRepo({
        userAccessToken: "user-token",
        fullName: "acme/shop",
      }),
    ).rejects.toThrow(/not available via your GitHub App installations/);
  });

  it("fails when the user has no installations", async () => {
    paginate.mockResolvedValueOnce([]);

    await expect(
      resolveUserInstallationForRepo({
        userAccessToken: "user-token",
        fullName: "acme/shop",
      }),
    ).rejects.toThrow(/No GitHub App installations found/);
  });
});
