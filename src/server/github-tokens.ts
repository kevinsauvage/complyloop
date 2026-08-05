import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import fs from "node:fs";
import path from "node:path";

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

function loadStore(): TokenStore {
  if (!fs.existsSync(tokenFilePath())) return { tokens: {} };
  try {
    return JSON.parse(fs.readFileSync(tokenFilePath(), "utf8")) as TokenStore;
  } catch {
    return { tokens: {} };
  }
}

function saveStore(store: TokenStore): void {
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

/**
 * Persists the user's GitHub OAuth token encrypted at rest (AES-256-GCM via
 * AUTH_SECRET). Migrates any leftover plaintext entries on write.
 */
export function storeUserGitHubToken(userId: string, accessToken: string): void {
  if (!userId || !accessToken) return;
  if (!process.env.AUTH_SECRET) {
    // Dev without Auth.js — skip disk persistence rather than store plaintext.
    return;
  }
  const store = loadStore();
  store.tokens[userId] = encryptToken(accessToken);
  // Opportunistically migrate any remaining plaintext neighbors.
  for (const [id, entry] of Object.entries(store.tokens)) {
    if (id === userId || isEncrypted(entry)) continue;
    store.tokens[id] = encryptToken(entry.accessToken);
  }
  saveStore(store);
}

export function getStoredGitHubToken(userId: string): string | null {
  const entry = loadStore().tokens[userId];
  if (!entry) return null;
  const token = resolveAccessToken(entry);
  if (!token) return null;
  // Rewrite plaintext to encrypted when AUTH_SECRET is available.
  if (!isEncrypted(entry) && process.env.AUTH_SECRET) {
    const store = loadStore();
    store.tokens[userId] = encryptToken(token);
    saveStore(store);
  }
  return token;
}

/** Removes a stored token (e.g. on sign-out). */
export function clearStoredGitHubToken(userId: string): void {
  if (!userId) return;
  const store = loadStore();
  if (!(userId in store.tokens)) return;
  delete store.tokens[userId];
  saveStore(store);
}
