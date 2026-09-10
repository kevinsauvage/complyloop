import { describe, expect, it } from "vitest";
import {
  githubRepoSearchError,
  parseGitHubRepoSearchResponse,
} from "./github-repo-search";

const repo = {
  fullName: "acme/app",
  name: "app",
  description: null,
  private: false,
  defaultBranch: "main",
  updatedAt: "2026-01-01T00:00:00.000Z",
  htmlUrl: "https://github.com/acme/app",
  cloneUrl: "https://github.com/acme/app.git",
};

describe("parseGitHubRepoSearchResponse", () => {
  it("accepts a search page", () => {
    const parsed = parseGitHubRepoSearchResponse({
      repos: [repo],
      hasMore: false,
    });
    expect(parsed.repos).toHaveLength(1);
    expect(parsed.hasMore).toBe(false);
  });

  it("rejects a forged payload", () => {
    expect(() => parseGitHubRepoSearchResponse({ error: "nope" })).toThrow();
    expect(() =>
      parseGitHubRepoSearchResponse({ repos: [{}], hasMore: false }),
    ).toThrow();
    expect(() =>
      parseGitHubRepoSearchResponse({ repos: [repo], hasMore: "no" }),
    ).toThrow();
  });
});

describe("githubRepoSearchError", () => {
  it("extracts a string error and ignores other shapes", () => {
    expect(githubRepoSearchError({ error: "boom" })).toBe("boom");
    expect(githubRepoSearchError({ error: 42 })).toBeUndefined();
    expect(githubRepoSearchError(null)).toBeUndefined();
  });
});
