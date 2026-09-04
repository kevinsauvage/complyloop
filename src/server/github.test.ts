import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchGitHubRepo, listGitHubRepos } from "./github";

afterEach(() => {
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
