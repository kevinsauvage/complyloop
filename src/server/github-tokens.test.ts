import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  decryptToken,
  encryptToken,
  getStoredGitHubToken,
  storeUserGitHubToken,
} from "./github-tokens";

let dataDir: string;
const previousDataDir = process.env.DATA_DIR;
const previousSecret = process.env.AUTH_SECRET;

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "tokens-test-"));
  process.env.DATA_DIR = dataDir;
  process.env.AUTH_SECRET = "test-auth-secret-for-token-encryption";
});

afterEach(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
  if (previousDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = previousDataDir;
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

  it("stores encrypted tokens on disk and reads them back", async () => {
    await storeUserGitHubToken("user-1", "gho_live_token");
    const raw = JSON.parse(
      fs.readFileSync(path.join(dataDir, "github-tokens.json"), "utf8"),
    ) as {
      tokens: Record<string, { accessToken?: string; ciphertext?: string }>;
    };
    expect(raw.tokens["user-1"].accessToken).toBeUndefined();
    expect(raw.tokens["user-1"].ciphertext).toBeDefined();
    expect(await getStoredGitHubToken("user-1")).toBe("gho_live_token");
  });

  it("migrates plaintext entries on read", async () => {
    fs.writeFileSync(
      path.join(dataDir, "github-tokens.json"),
      JSON.stringify({
        tokens: {
          "user-legacy": {
            accessToken: "gho_plain",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        },
      }),
    );
    expect(await getStoredGitHubToken("user-legacy")).toBe("gho_plain");
    const raw = JSON.parse(
      fs.readFileSync(path.join(dataDir, "github-tokens.json"), "utf8"),
    ) as {
      tokens: Record<string, { accessToken?: string; ciphertext?: string }>;
    };
    expect(raw.tokens["user-legacy"].accessToken).toBeUndefined();
    expect(raw.tokens["user-legacy"].ciphertext).toBeDefined();
  });

  it("skips persistence when AUTH_SECRET is missing", async () => {
    delete process.env.AUTH_SECRET;
    await storeUserGitHubToken("user-1", "gho_should_not_land");
    expect(fs.existsSync(path.join(dataDir, "github-tokens.json"))).toBe(false);
  });
});
