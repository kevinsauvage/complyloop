import { afterEach, describe, expect, it, vi } from "vitest";
import type { Project } from "@/core/project-types";
import { resolveProjectGitHubToken } from "./github-access";

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
