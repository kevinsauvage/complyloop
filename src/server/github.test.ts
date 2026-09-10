import { describe, expect, it } from "vitest";
import {
  githubCloneUrl,
  githubPublicCloneUrl,
  redactCloneUrl,
} from "./github";

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
    const redacted = redactCloneUrl(`fatal: unable to access '${url}': auth failed`);
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

  it("redacts leaked Bearer header values", () => {
    const redacted = redactCloneUrl(
      "http.extraHeader: Authorization: Bearer ghs_secret_token",
    );
    expect(redacted).not.toContain("ghs_secret_token");
    expect(redacted).toContain("Authorization: Bearer ***");
  });
});
