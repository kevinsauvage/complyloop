import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
  vi.restoreAllMocks();
});

describe("github token encryption", () => {
  it("round-trips encrypt/decrypt", async () => {
    const { encryptToken, decryptToken } = await import("./github-tokens");
    const entry = encryptToken("gho_secret_token");
    expect(entry.v).toBe(1);
    expect(entry.ciphertext).not.toContain("gho_secret_token");
    expect(decryptToken(entry)).toBe("gho_secret_token");
  });

  it("skips persistence when AUTH_SECRET is missing", async () => {
    const { storeUserGitHubToken } = await import("./github-tokens");
    delete process.env.AUTH_SECRET;
    await storeUserGitHubToken("user-1", "gho_should_not_land");
    expect(getDrizzle).not.toHaveBeenCalled();
  });
});

describe("storeUserGitHubToken", () => {
  it("persists an access token with optional refresh token and expiry", async () => {
    const { storeUserGitHubToken } = await import("./github-tokens");
    const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
    const values = vi.fn(() => ({ onConflictDoUpdate }));
    const insert = vi.fn(() => ({ values }));
    const drizzle = { insert };
    getDrizzle.mockResolvedValue(drizzle);

    await storeUserGitHubToken(
      "user-1",
      "gho_access",
      "gho_refresh",
      "2026-12-31T23:59:59.000Z",
    );

    expect(drizzle.insert).toHaveBeenCalled();
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        ciphertext: expect.any(String),
        refreshToken: expect.any(String),
        expiresAt: "2026-12-31T23:59:59.000Z",
      }),
    );
  });
});

describe("getStoredGitHubTokenWithExpiry", () => {
  it("returns decrypted token with refresh and expiry", async () => {
    const { encryptToken, getStoredGitHubTokenWithExpiry } = await import("./github-tokens");
    const encrypted = encryptToken("gho_access");
    const encryptedRefresh = encryptToken("gho_refresh");
    getDrizzle.mockResolvedValue({
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => [
              {
                userId: "user-1",
                iv: encrypted.iv,
                tag: encrypted.tag,
                ciphertext: encrypted.ciphertext,
                refreshToken: encryptedRefresh.ciphertext,
                refreshIv: encryptedRefresh.iv,
                refreshTag: encryptedRefresh.tag,
                expiresAt: "2026-12-31T23:59:59.000Z",
                updatedAt: encrypted.updatedAt,
              },
            ]),
          })),
        })),
      })),
    });

    const result = await getStoredGitHubTokenWithExpiry("user-1");
    expect(result?.accessToken).toBe("gho_access");
    expect(result?.refreshToken).toBe("gho_refresh");
    expect(result?.expiresAt).toBe("2026-12-31T23:59:59.000Z");
  });
});

describe("refreshGitHubToken", () => {
  it("refreshes an expired token and persists the new one", async () => {
    const { refreshGitHubToken } = await import("./github-tokens");
    const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
    const values = vi.fn(() => ({ onConflictDoUpdate }));
    const insert = vi.fn(() => ({ values }));
    const drizzle = { insert };
    getDrizzle.mockResolvedValue(drizzle);

    const originalFetch = global.fetch;
    global.fetch = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            access_token: "gho_new_access",
            expires_in: 3600,
            refresh_token: "gho_new_refresh",
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      ),
    ) as unknown as typeof fetch;

    process.env.AUTH_GITHUB_ID = "client-id";
    process.env.AUTH_GITHUB_SECRET = "client-secret";

    try {
      const result = await refreshGitHubToken({
        userId: "user-1",
        refreshToken: "gho_refresh",
      });

      expect(result.accessToken).toBe("gho_new_access");
      expect(result.expiresAt).toBeDefined();
      expect(drizzle.insert).toHaveBeenCalled();
      expect(values).toHaveBeenCalled();
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("throws when GitHub client credentials are missing", async () => {
    delete process.env.AUTH_GITHUB_ID;
    delete process.env.AUTH_GITHUB_SECRET;

    const { refreshGitHubToken } = await import("./github-tokens");
    await expect(
      refreshGitHubToken({ userId: "user-1", refreshToken: "rt" }),
    ).rejects.toThrow(/AUTH_GITHUB_ID and AUTH_GITHUB_SECRET are required/);
  });
});
