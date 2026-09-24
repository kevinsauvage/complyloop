import { describe, expect, it, vi } from "vitest";

import { listAvailableRepos } from "./github-connector";
import type { GitHubRepoSummary } from "./github-types";

const { listReposViaInstallations } = vi.hoisted(() => ({
  listReposViaInstallations: vi.fn(),
}));

vi.mock("./github-app", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("./github-app")>();
  return {
    ...actual,
    listReposViaInstallations,
  };
});

const summary: GitHubRepoSummary = {
  fullName: "acme/shop",
  name: "shop",
  description: "Shop app",
  private: false,
  defaultBranch: "main",
  updatedAt: "",
  htmlUrl: "https://github.com/acme/shop",
  cloneUrl: "https://github.com/acme/shop.git",
};

describe("listAvailableRepos", () => {
  it("forwards token, paging, and query to the installation listing", async () => {
    listReposViaInstallations.mockResolvedValue([summary]);
    await expect(
      listAvailableRepos({ accessToken: "gho_token", perPage: 50, q: "shop" }),
    ).resolves.toEqual([summary]);
    expect(listReposViaInstallations).toHaveBeenCalledWith({
      userAccessToken: "gho_token",
      perPage: 50,
      q: "shop",
    });
  });
});
