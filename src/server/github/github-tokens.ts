import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import { getDrizzle } from "@complyloop/db/postgres";
import {
  deleteGithubTokenRowByUserId,
  findGithubTokenRowByUserId,
  upsertGithubTokenRow,
} from "@complyloop/db/repo/github-tokens";

import { reportError } from "../observability";

interface EncryptedTokenEntry {
  v: 1;
  iv: string;
  tag: string;
  ciphertext: string;
  updatedAt: string;
  refreshToken?: string;
  expiresAt?: string;
}

function deriveKey(): Buffer {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error(
      "AUTH_SECRET is required to encrypt/decrypt stored GitHub tokens.",
    );
  }
  return createHash("sha256").update(secret).digest();
}

export function encryptToken(accessToken: string): EncryptedTokenEntry {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(accessToken, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return {
    v: 1,
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    updatedAt: new Date().toISOString(),
  };
}

export function decryptToken(entry: EncryptedTokenEntry): string {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    deriveKey(),
    Buffer.from(entry.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(entry.tag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(entry.ciphertext, "base64")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}

/**
 * Persists the user's GitHub OAuth token encrypted at rest (AES-256-GCM via
 * AUTH_SECRET) in Postgres.
 */
export async function storeUserGitHubToken(
  userId: string,
  accessToken: string,
  refreshToken?: string,
  expiresAt?: string,
): Promise<void> {
  if (!userId || !accessToken) return;
  // encryptToken throws a clear error when AUTH_SECRET is missing — fail loud
  // rather than silently dropping the token and breaking every later clone.
  const entry = encryptToken(accessToken);
  const drizzle = await getDrizzle();

  let refreshEntry: EncryptedTokenEntry | null = null;
  if (refreshToken) {
    refreshEntry = encryptToken(refreshToken);
  }

  await upsertGithubTokenRow(drizzle, {
    userId,
    v: entry.v,
    iv: entry.iv,
    tag: entry.tag,
    ciphertext: entry.ciphertext,
    updatedAt: entry.updatedAt,
    refreshToken: refreshEntry?.ciphertext ?? null,
    refreshIv: refreshEntry?.iv ?? null,
    refreshTag: refreshEntry?.tag ?? null,
    expiresAt: expiresAt ?? null,
  });
}

export interface StoredGitHubToken {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
}

export async function getStoredGitHubToken(
  userId: string,
): Promise<string | null> {
  const stored = await getStoredGitHubTokenWithExpiry(userId);
  return stored?.accessToken ?? null;
}

export async function getStoredGitHubTokenWithExpiry(
  userId: string,
): Promise<StoredGitHubToken | null> {
  const row = await findGithubTokenRowByUserId(await getDrizzle(), userId);
  if (!row) return null;
  try {
    const accessToken = decryptToken({
      v: 1,
      iv: row.iv,
      tag: row.tag,
      ciphertext: row.ciphertext,
      updatedAt: row.updatedAt,
    });
    const refreshToken =
      row.refreshToken && row.refreshIv && row.refreshTag
        ? decryptToken({
            v: 1,
            iv: row.refreshIv,
            tag: row.refreshTag,
            ciphertext: row.refreshToken,
            updatedAt: row.updatedAt,
          })
        : undefined;
    return {
      accessToken,
      ...(refreshToken ? { refreshToken } : {}),
      ...(row.expiresAt ? { expiresAt: row.expiresAt } : {}),
    };
  } catch (error) {
    // A stored row that cannot be decrypted (e.g. AUTH_SECRET rotated or
    // mismatched) is a server-side problem, not "user never connected".
    // Page the operator via the error report and tell the user to reconnect.
    reportError(error, { code: "github_token_unreadable", userId });
    throw new PublicError(
      "Your saved GitHub connection can't be read. Sign out and sign in again to reconnect GitHub.",
      "github_token_unreadable",
    );
  }
}

/** Removes a stored token (e.g. on sign-out). */
export async function clearStoredGitHubToken(userId: string): Promise<void> {
  if (!userId) return;
  await deleteGithubTokenRowByUserId(await getDrizzle(), userId);
}

export interface RefreshGitHubTokenInput {
  userId: string;
  refreshToken: string;
}

export interface RefreshGitHubTokenResult {
  accessToken: string;
  expiresAt: string;
}

export async function refreshGitHubToken({
  userId,
  refreshToken,
}: RefreshGitHubTokenInput): Promise<RefreshGitHubTokenResult> {
  const clientId = process.env.AUTH_GITHUB_ID;
  const clientSecret = process.env.AUTH_GITHUB_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      "AUTH_GITHUB_ID and AUTH_GITHUB_SECRET are required to refresh GitHub tokens.",
    );
  }

  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `GitHub token refresh failed with status ${response.status}`,
    );
  }

  const data = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
    refresh_token?: string;
  };

  if (!data.access_token) {
    throw new Error("GitHub token refresh returned no access_token.");
  }

  const now = new Date();
  const expiresAt = data.expires_in
    ? new Date(now.getTime() + data.expires_in * 1000).toISOString()
    : new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString();

  await storeUserGitHubToken(
    userId,
    data.access_token,
    data.refresh_token ?? refreshToken,
    expiresAt,
  );

  return {
    accessToken: data.access_token,
    expiresAt,
  };
}
