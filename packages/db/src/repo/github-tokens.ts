import { eq } from "drizzle-orm";

import type { DrizzleDb } from "../postgres.ts";
import { githubTokens } from "../schema.ts";

/**
 * Stored GitHub OAuth token row (encrypted at rest — encryption lives in
 * `src/server/github/github-tokens.ts`; this module is persistence only).
 */
export interface GithubTokenRow {
  userId: string;
  v: number;
  iv: string;
  tag: string;
  ciphertext: string;
  updatedAt: string;
  refreshToken: string | null;
  refreshIv: string | null;
  refreshTag: string | null;
  expiresAt: string | null;
}

export async function upsertGithubTokenRow(
  db: DrizzleDb,
  row: GithubTokenRow,
): Promise<void> {
  await db
    .insert(githubTokens)
    .values({
      userId: row.userId,
      v: row.v,
      iv: row.iv,
      tag: row.tag,
      ciphertext: row.ciphertext,
      updatedAt: row.updatedAt,
      refreshToken: row.refreshToken,
      refreshIv: row.refreshIv,
      refreshTag: row.refreshTag,
      expiresAt: row.expiresAt,
    })
    .onConflictDoUpdate({
      target: githubTokens.userId,
      set: {
        v: row.v,
        iv: row.iv,
        tag: row.tag,
        ciphertext: row.ciphertext,
        updatedAt: row.updatedAt,
        refreshToken: row.refreshToken,
        refreshIv: row.refreshIv,
        refreshTag: row.refreshTag,
        expiresAt: row.expiresAt,
      },
    });
}

export async function findGithubTokenRowByUserId(
  db: DrizzleDb,
  userId: string,
): Promise<GithubTokenRow | undefined> {
  const rows = await db
    .select()
    .from(githubTokens)
    .where(eq(githubTokens.userId, userId))
    .limit(1);
  const row = rows[0];
  if (!row) return undefined;
  return {
    userId: row.userId,
    v: row.v,
    iv: row.iv,
    tag: row.tag,
    ciphertext: row.ciphertext,
    updatedAt: row.updatedAt,
    refreshToken: row.refreshToken,
    refreshIv: row.refreshIv,
    refreshTag: row.refreshTag,
    expiresAt: row.expiresAt,
  };
}

export async function deleteGithubTokenRowByUserId(
  db: DrizzleDb,
  userId: string,
): Promise<void> {
  await db.delete(githubTokens).where(eq(githubTokens.userId, userId));
}
