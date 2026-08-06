import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { getDrizzle, isPostgresConfigured } from "./db-store/client";
import { githubTokens } from "./db-store/schema";

/** Legacy plaintext entry — migrated to encrypted on next write. */
interface PlainTokenEntry {
  accessToken: string;
  updatedAt: string;
}

interface EncryptedTokenEntry {
  v: 1;
  iv: string;
  tag: string;
  ciphertext: string;
  updatedAt: string;
}

type TokenEntry = PlainTokenEntry | EncryptedTokenEntry;

interface TokenStore {
  tokens: Record<string, TokenEntry>;
}

function dataDir(): string {
  return process.env.DATA_DIR ?? path.join(process.cwd(), ".data");
}

function tokenFilePath(): string {
  return path.join(dataDir(), "github-tokens.json");
}

function isEncrypted(entry: TokenEntry): entry is EncryptedTokenEntry {
  return "v" in entry && entry.v === 1 && "ciphertext" in entry;
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

function loadJsonStore(): TokenStore {
  if (!fs.existsSync(tokenFilePath())) return { tokens: {} };
  try {
    return JSON.parse(fs.readFileSync(tokenFilePath(), "utf8")) as TokenStore;
  } catch {
    return { tokens: {} };
  }
}

function saveJsonStore(store: TokenStore): void {
  fs.mkdirSync(dataDir(), { recursive: true });
  fs.writeFileSync(tokenFilePath(), JSON.stringify(store, null, 2), {
    mode: 0o600,
  });
}

function resolveAccessToken(entry: TokenEntry): string | null {
  if (isEncrypted(entry)) {
    try {
      return decryptToken(entry);
    } catch {
      return null;
    }
  }
  return entry.accessToken;
}

async function storeTokenPostgres(
  userId: string,
  entry: EncryptedTokenEntry,
): Promise<void> {
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

async function getTokenPostgres(userId: string): Promise<string | null> {
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

async function clearTokenPostgres(userId: string): Promise<void> {
  const drizzle = await getDrizzle();
  await drizzle.delete(githubTokens).where(eq(githubTokens.userId, userId));
}

/**
 * Persists the user's GitHub OAuth token encrypted at rest (AES-256-GCM via
 * AUTH_SECRET). Uses Postgres when `DATABASE_URL` is set; otherwise JSON under
 * `$DATA_DIR`. Migrates leftover plaintext JSON entries on write.
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
  const encrypted = encryptToken(accessToken);
  if (isPostgresConfigured()) {
    await storeTokenPostgres(userId, encrypted);
    return;
  }
  const store = loadJsonStore();
  store.tokens[userId] = encrypted;
  for (const [id, entry] of Object.entries(store.tokens)) {
    if (id === userId || isEncrypted(entry)) continue;
    store.tokens[id] = encryptToken(entry.accessToken);
  }
  saveJsonStore(store);
}

export async function getStoredGitHubToken(
  userId: string,
): Promise<string | null> {
  if (isPostgresConfigured()) {
    return getTokenPostgres(userId);
  }
  const entry = loadJsonStore().tokens[userId];
  if (!entry) return null;
  const token = resolveAccessToken(entry);
  if (!token) return null;
  if (!isEncrypted(entry) && process.env.AUTH_SECRET) {
    const store = loadJsonStore();
    store.tokens[userId] = encryptToken(token);
    saveJsonStore(store);
  }
  return token;
}

/** Removes a stored token (e.g. on sign-out). */
export async function clearStoredGitHubToken(userId: string): Promise<void> {
  if (!userId) return;
  if (isPostgresConfigured()) {
    await clearTokenPostgres(userId);
    return;
  }
  const store = loadJsonStore();
  if (!(userId in store.tokens)) return;
  delete store.tokens[userId];
  saveJsonStore(store);
}
