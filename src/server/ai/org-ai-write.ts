import "server-only";

import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import {
  acquireNamedPostgresAdvisoryLock,
  type DrizzleDb,
  getDrizzle,
  orgAiWriteLockKey,
} from "@complyloop/db/postgres";
import { listMembershipsForOrgs } from "@complyloop/db/repo/orgs";

import { getSession } from "../auth-session";
import { assertOrgPermission } from "../workspace/project-visibility";

export interface OrgAiWriteContext {
  tx: DrizzleDb;
  userId: string;
  /** Evidence/audit author (GitHub login, else user id). */
  actor: string;
}

/**
 * Org AI-configuration write primitive: org-scoped advisory lock, one
 * transaction, authorization re-checked under the lock. Separate from
 * `withOrgWrite` (user-scoped lock, tenancy rows) because two admins may edit
 * the same org's AI settings concurrently — reading the stored envelope
 * outside this lock then upserting it would clobber a concurrent key rotation.
 *
 * Expensive provider validation runs *before* this helper: a transaction must
 * never be held across an API call.
 */
export async function withOrgAiWrite<T>(
  orgId: string,
  fn: (ctx: OrgAiWriteContext) => Promise<T>,
): Promise<T> {
  const session = await getSession();
  const userId = session?.user?.id ?? null;
  if (!userId) throw new PublicError("Sign in to continue.");
  const actor = session?.user?.login ?? userId;

  const drizzle = await getDrizzle();
  return drizzle.transaction(async (tx) => {
    await acquireNamedPostgresAdvisoryLock(tx, orgAiWriteLockKey(orgId));
    const memberships = await listMembershipsForOrgs(tx, [orgId]);
    assertOrgPermission(memberships, userId, orgId, "org.manage_ai");
    return fn({ tx, userId, actor });
  });
}
