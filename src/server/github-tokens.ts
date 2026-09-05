import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { eq } from "drizzle-orm";
import { getDrizzle } from "@complyloop/db/client";
import { githubTokens } from "@complyloop/db/schema";

interface EncryptedTokenEntry {
  v: 1;
  iv: string;
  tag: string;
  ciphertext: string;
  updatedAt: string;
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
): Promise<void> {
  if (!userId || !accessToken) return;
  if (!process.env.AUTH_SECRET) {
    // Dev without Auth.js — skip persistence rather than store plaintext.
    return;
  }
  const entry = encryptToken(accessToken);
  const drizzle = await getDrizzle();
  await drizzle
    .insert(githubTokens)
    .values({
      userId,
      v: entry.v,
      iv: entry.iv,
      tag: entry.tag,
      ciphertext: entry.ciphertext,
      updatedAt: entry.updatedAt,
    })
    .onConflictDoUpdate({
      target: githubTokens.userId,
      set: {
        v: entry.v,
        iv: entry.iv,
        tag: entry.tag,
        ciphertext: entry.ciphertext,
        updatedAt: entry.updatedAt,
      },
    });
}

export async function getStoredGitHubToken(
  userId: string,
): Promise<string | null> {
  const drizzle = await getDrizzle();
  const rows = await drizzle
    .select()
    .from(githubTokens)
    .where(eq(githubTokens.userId, userId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  try {
    return decryptToken({
      v: 1,
      iv: row.iv,
      tag: row.tag,
      ciphertext: row.ciphertext,
      updatedAt: row.updatedAt,
    });
  } catch {
    return null;
  }
}

/** Removes a stored token (e.g. on sign-out). */
export async function clearStoredGitHubToken(userId: string): Promise<void> {
  if (!userId) return;
  const drizzle = await getDrizzle();
  await drizzle.delete(githubTokens).where(eq(githubTokens.userId, userId));
}
