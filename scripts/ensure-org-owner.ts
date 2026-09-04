#!/usr/bin/env tsx
/**
 * Ensures a signed-in GitHub user has a personal organization (owner role).
 * Usage: npm run db:ensure-owner -- <github-user-id> <github-login>
 *
 * Example: npm run db:ensure-owner -- 64160579 kevinsauvage
 */
import path from "node:path";
import { config as loadEnv } from "dotenv";
import { ensurePersonalOrgProvisioned } from "../src/server/workspace";

function loadLocalEnv(): void {
  if (process.env.DATABASE_URL?.trim()) return;
  loadEnv({ path: path.join(process.cwd(), ".env.local") });
  if (!process.env.DATABASE_URL?.trim()) {
    loadEnv({ path: path.join(process.cwd(), ".env") });
  }
}

async function main(): Promise<void> {
  loadLocalEnv();
  const userId = process.argv[2]?.trim();
  const githubLogin = process.argv[3]?.trim();
  if (!userId || !githubLogin) {
    console.error(
      "Usage: npm run db:ensure-owner -- <github-user-id> <github-login>",
    );
    process.exit(1);
  }
  await ensurePersonalOrgProvisioned(userId, githubLogin);
  console.log(`Ensured personal org (owner) for ${githubLogin} (${userId}).`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
