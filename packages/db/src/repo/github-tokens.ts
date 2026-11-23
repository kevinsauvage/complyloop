import { eq } from "drizzle-orm";

import type { DrizzleDb } from "../postgres.ts";
import { githubTokens } from "../schema.ts";

/**
 * Stored GitHub OAuth token row (encrypted at rest — encryption lives in
 * `src/server/github/github-tokens.ts`; this module is persistence only).
 */
export type GithubTokenRow = typeof githubTokens.$inferSelect;

export async function upsertGithubTokenRow(
  db: DrizzleDb,
  row: GithubTokenRow,
): Promise<void> {
  // `set: row` rewrites the conflicting key with its own value: harmless.
  await db
    .insert(githubTokens)
    .values(row)
    .onConflictDoUpdate({ target: githubTokens.userId, set: row });
}

export async function findGithubTokenRowByUserId(
  db: DrizzleDb,
  userId: string,
): Promise<GithubTokenRow | undefined> {
  const [row] = await db
    .select()
    .from(githubTokens)
    .where(eq(githubTokens.userId, userId))
    .limit(1);
  return row;
}

export async function deleteGithubTokenRowByUserId(
  db: DrizzleDb,
  userId: string,
): Promise<void> {
  await db.delete(githubTokens).where(eq(githubTokens.userId, userId));
}
