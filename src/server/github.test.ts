import { afterEach, describe, expect, it, vi } from "vitest";
import { githubCloneUrl } from "./connect-github";
import { listGitHubRepos } from "./github";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("githubCloneUrl", () => {
  it("embeds the token for HTTPS clone without storing it", () => {
    expect(githubCloneUrl("acme/shop", "gho_secret")).toBe(
      "https://x-access-token:gho_secret@github.com/acme/shop.git",
    );
  });

  it("URL-encodes special characters in the token", () => {
    expect(githubCloneUrl("acme/shop", "a/b")).toContain(
      "x-access-token:a%2Fb@",
    );
  });
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
