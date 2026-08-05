import fs from "node:fs";
import path from "node:path";

interface TokenStore {
  tokens: Record<string, { accessToken: string; updatedAt: string }>;
}

function dataDir(): string {
  return process.env.DATA_DIR ?? path.join(process.cwd(), ".data");
}

function tokenFilePath(): string {
  return path.join(dataDir(), "github-tokens.json");
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
  fs.writeFileSync(tokenFilePath(), JSON.stringify(store, null, 2));
}

/** Persists the user's GitHub OAuth token for webhook-driven re-assess / PR push. */
export function storeUserGitHubToken(userId: string, accessToken: string): void {
  if (!userId || !accessToken) return;
  const store = loadStore();
  store.tokens[userId] = {
    accessToken,
    updatedAt: new Date().toISOString(),
  };
  saveStore(store);
}

export function getStoredGitHubToken(userId: string): string | null {
  const entry = loadStore().tokens[userId];
  return entry?.accessToken ?? null;
}
