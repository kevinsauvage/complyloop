import { Octokit } from "@octokit/rest";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createOctokit,
  filterReposByQuery,
  githubCloneUrl,
  githubPublicCloneUrl,
  lookupGitHubUser,
  mapGitHubRepo,
  octokitErrorMessage,
  redactCloneUrl,
} from "./github";

const getByUsername = vi.fn();

vi.mock("@octokit/rest", () => ({
  Octokit: vi.fn(function MockOctokit(this: {
    rest: { users: { getByUsername: typeof getByUsername } };
  }) {
    this.rest = { users: { getByUsername } };
  }),
}));

afterEach(() => {
  vi.unstubAllEnvs();
  getByUsername.mockReset();
  vi.mocked(Octokit).mockClear();
});

describe("githubPublicCloneUrl", () => {
  it("builds a token-free URL for a valid full name", () => {
    expect(githubPublicCloneUrl("octo/repo")).toBe(
      "https://github.com/octo/repo.git",
    );
  });

  it("rejects malformed full names", () => {
    expect(() => githubPublicCloneUrl("not-a-repo")).toThrow();
    expect(() => githubPublicCloneUrl("")).toThrow();
  });
});

describe("redactCloneUrl", () => {
  it("strips the token from an authenticated clone URL", () => {
    const url = githubCloneUrl("octo/repo", "gho_secret_token");
    expect(url).toContain("gho_secret_token");
    const redacted = redactCloneUrl(
      `fatal: unable to access '${url}': auth failed`,
    );
    expect(redacted).not.toContain("gho_secret_token");
    expect(redacted).not.toContain("x-access-token:");
    expect(redacted).toContain("https://***@github.com/octo/repo.git");
  });

  it("leaves credential-free text untouched", () => {
    expect(redactCloneUrl("auth failed")).toBe("auth failed");
    expect(redactCloneUrl("https://github.com/octo/repo.git")).toBe(
      "https://github.com/octo/repo.git",
    );
  });

  it("redacts user:password credentials too", () => {
    expect(redactCloneUrl("https://user:s3cret@example.com/r.git")).toBe(
      "https://***@example.com/r.git",
    );
  });

  it("redacts leaked Authorization header values", () => {
    const bearer = redactCloneUrl(
      "http.extraHeader: Authorization: Bearer ghs_secret_token",
    );
    expect(bearer).not.toContain("ghs_secret_token");
    expect(bearer).toContain("Authorization: Bearer ***");

    const basic = redactCloneUrl(
      "http.extraHeader: Authorization: Basic eC1hY2Nlc3MtdG9rZW46Z2hzX3NlY3JldA==",
    );
    expect(basic).not.toContain("eC1hY2Nlc3MtdG9rZW46Z2hzX3NlY3JldA==");
    expect(basic).toContain("Authorization: Basic ***");
  });
});

describe("mapGitHubRepo", () => {
  const apiRepo = {
    full_name: "acme/shop",
    name: "shop",
    description: "Shop app",
    private: false,
    default_branch: "develop",
    updated_at: "2026-01-01T00:00:00.000Z",
    html_url: "https://github.com/acme/shop",
    clone_url: "https://github.com/acme/shop.git",
  };

  it("maps the REST payload and keeps the installation id", () => {
    expect(mapGitHubRepo(apiRepo, 123)).toEqual({
      fullName: "acme/shop",
      name: "shop",
      description: "Shop app",
      private: false,
      defaultBranch: "develop",
      updatedAt: "2026-01-01T00:00:00.000Z",
      htmlUrl: "https://github.com/acme/shop",
      cloneUrl: "https://github.com/acme/shop.git",
      installationId: 123,
    });
  });

  it("falls back to main and empty timestamps when the API omits them", () => {
    const mapped = mapGitHubRepo({
      ...apiRepo,
      default_branch: null,
      updated_at: null,
      description: null,
    });
    expect(mapped.defaultBranch).toBe("main");
    expect(mapped.updatedAt).toBe("");
    expect(mapped.description).toBeNull();
    expect(mapped.installationId).toBeUndefined();
  });
});

describe("filterReposByQuery", () => {
  const repos = [
    mapGitHubRepo({
      full_name: "acme/shop",
      name: "shop",
      description: "Shop app",
      private: false,
      default_branch: "main",
      updated_at: null,
      html_url: "https://github.com/acme/shop",
      clone_url: "https://github.com/acme/shop.git",
    }),
    mapGitHubRepo({
      full_name: "acme/docs",
      name: "docs",
      description: null,
      private: false,
      default_branch: "main",
      updated_at: null,
      html_url: "https://github.com/acme/docs",
      clone_url: "https://github.com/acme/docs.git",
    }),
  ];

  it("returns everything without a query", () => {
    expect(filterReposByQuery(repos, undefined)).toHaveLength(2);
    expect(filterReposByQuery(repos, "  ")).toHaveLength(2);
  });

  it("matches full names and descriptions case-insensitively", () => {
    expect(filterReposByQuery(repos, "SHOP").map((repo) => repo.name)).toEqual([
      "shop",
    ]);
    expect(filterReposByQuery(repos, "shop app")).toHaveLength(1);
    expect(filterReposByQuery(repos, "nope")).toHaveLength(0);
  });
});

describe("createOctokit", () => {
  it("uses api.github.com without an override", () => {
    vi.stubEnv("GITHUB_API_BASE_URL", "");
    createOctokit("gho_token");
    expect(vi.mocked(Octokit)).toHaveBeenCalledWith({
      auth: "gho_token",
      userAgent: "ComplyLoop",
      request: { timeout: 15_000 },
    });
  });

  it("honors a GHES base URL override", () => {
    vi.stubEnv("GITHUB_API_BASE_URL", "https://ghe.example/api/v3");
    createOctokit("gho_token");
    expect(vi.mocked(Octokit)).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl: "https://ghe.example/api/v3" }),
    );
  });
});

describe("lookupGitHubUser", () => {
  it("returns the login for an existing user, tolerating @ and whitespace", async () => {
    getByUsername.mockResolvedValue({ data: { login: "octocat" } });
    await expect(lookupGitHubUser("token", "  @octocat ")).resolves.toEqual({
      status: "found",
      login: "octocat",
    });
    expect(getByUsername).toHaveBeenCalledWith({ username: "octocat" });
  });

  it("maps 404 to not-found", async () => {
    getByUsername.mockRejectedValue({ status: 404, message: "Not Found" });
    await expect(lookupGitHubUser("token", "ghost")).resolves.toEqual({
      status: "not-found",
    });
  });

  it("maps outages to unverifiable so invites are never blocked", async () => {
    getByUsername.mockRejectedValue(new Error("fetch failed"));
    await expect(lookupGitHubUser("token", "octocat")).resolves.toEqual({
      status: "unverifiable",
    });
    getByUsername.mockRejectedValue({ status: 500, message: "boom" });
    await expect(lookupGitHubUser("token", "octocat")).resolves.toEqual({
      status: "unverifiable",
    });
  });
});

describe("octokitErrorMessage", () => {
  it("includes the status code for API errors", () => {
    expect(
      octokitErrorMessage(
        { status: 404, message: "Not Found" },
        "GitHub PR API failed",
      ),
    ).toBe("GitHub PR API failed (404): Not Found");
  });

  it("falls back to the fallback message without a string message", () => {
    expect(octokitErrorMessage({ status: 403 }, "failed")).toBe(
      "failed (403): failed",
    );
  });

  it("falls back for plain errors and garbage", () => {
    expect(octokitErrorMessage(new Error("boom"), "failed")).toBe(
      "failed: boom",
    );
    expect(octokitErrorMessage(null, "failed")).toBe("failed");
    expect(octokitErrorMessage({ status: "nope" }, "failed")).toBe("failed");
  });
});
