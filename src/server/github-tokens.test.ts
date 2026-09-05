import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  decryptToken,
  encryptToken,
  storeUserGitHubToken,
} from "./github-tokens";

const getDrizzle = vi.hoisted(() => vi.fn());

vi.mock("@complyloop/db/client", () => ({
  getDrizzle: () => getDrizzle(),
}));

const previousSecret = process.env.AUTH_SECRET;

beforeEach(() => {
  process.env.AUTH_SECRET = "test-auth-secret-for-token-encryption";
  getDrizzle.mockReset();
});

afterEach(() => {
  if (previousSecret === undefined) delete process.env.AUTH_SECRET;
  else process.env.AUTH_SECRET = previousSecret;
});

describe("github token encryption", () => {
  it("round-trips encrypt/decrypt", () => {
    const entry = encryptToken("gho_secret_token");
    expect(entry.v).toBe(1);
    expect(entry.ciphertext).not.toContain("gho_secret_token");
    expect(decryptToken(entry)).toBe("gho_secret_token");
  });

  it("skips persistence when AUTH_SECRET is missing", async () => {
    delete process.env.AUTH_SECRET;
    await storeUserGitHubToken("user-1", "gho_should_not_land");
    expect(getDrizzle).not.toHaveBeenCalled();
  });
});
