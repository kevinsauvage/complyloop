import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { verifyGitHubSignature } from "./webhook";

afterEach(() => {
  delete process.env.GITHUB_WEBHOOK_SECRET;
});

describe("verifyGitHubSignature", () => {
  it("accepts a valid HMAC SHA-256 signature", () => {
    process.env.GITHUB_WEBHOOK_SECRET = "test-secret";
    const body = '{"action":"opened"}';
    const digest = createHmac("sha256", "test-secret").update(body).digest("hex");
    expect(verifyGitHubSignature(body, `sha256=${digest}`)).toBe(true);
  });

  it("rejects missing or invalid signatures", () => {
    process.env.GITHUB_WEBHOOK_SECRET = "test-secret";
    expect(verifyGitHubSignature("{}", null)).toBe(false);
    expect(verifyGitHubSignature("{}", "sha256=deadbeef")).toBe(false);
  });
});
