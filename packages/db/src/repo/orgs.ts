import { and, eq, inArray, or, sql } from "drizzle-orm";

import type {
  Organization,
  OrgMembership,
} from "@complyloop/analysis-core/contract/project-types";

import { isUniqueViolation } from "../pg-errors.ts";
import type { DrizzleDb } from "../postgres.ts";
import { orgWriteLockKey, withNamedPostgresAdvisoryLock } from "../postgres.ts";
import { memberships, organizations } from "../schema.ts";
import { membershipToRow, organizationToRow } from "./mappers.ts";

export function slugifyOrgName(input: string): string {
  const cleaned = input
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return cleaned.length > 0 ? cleaned : "org";
}

export function nextUniqueSlug(
  base: string,
  taken: ReadonlySet<string>,
): string {
  if (!taken.has(base)) return base;
  let index = 2;
  while (taken.has(`${base}-${index}`)) index += 1;
  return `${base}-${index}`;
}

/** Org ids the user belongs to (membership lookup before a scoped load). */
export async function listOrgIdsForUser(
  drizzle: DrizzleDb,
  userId: string | null,
  githubLogin: string | null,
): Promise<string[]> {
  if (!userId && !githubLogin) return [];
  const clauses = [];
  if (userId) clauses.push(eq(memberships.userId, userId));
  if (githubLogin) {
    const login = githubLogin.trim().toLowerCase();
    if (login) {
      // Match unclaimed invites only — github_login may be stored with any
      // casing. A login is recyclable: once GitHub releases it, whoever takes
      // it next must not inherit the memberships of the previous holder, so a
      // row already bound to another user is never matched by login alone.
      clauses.push(
        sql`lower(${memberships.githubLogin}) = ${login} AND ${memberships.userId} IS NULL`,
      );
    }
  }
  if (clauses.length === 0) return [];
  const rows = await drizzle
    .select({ orgId: memberships.orgId })
    .from(memberships)
    .where(or(...clauses));
  return [...new Set(rows.map((row) => row.orgId))];
}

/**
 * One indexed read answering "is there anything left to provision for this
 * viewer?": the user owns an org (personal org exists) and no membership row
 * for their login is still unclaimed. Callers (auth sign-in / first write)
 * use this to skip the heavier load + claim writes in steady state.
 */
async function isPersonalOrgProvisioned(
  drizzle: DrizzleDb,
  userId: string,
  githubLogin: string,
): Promise<boolean> {
  const login = githubLogin.trim().toLowerCase();
  if (!login) return false;
  const rows = await drizzle
    .select({
      owned: sql<
        boolean | null
      >`bool_or(${memberships.userId} = ${userId} AND ${memberships.role} = 'owner')`,
      unclaimed: sql<
        boolean | null
      >`bool_or(lower(${memberships.githubLogin}) = ${login} AND ${memberships.userId} IS NULL)`,
    })
    .from(memberships)
    .where(
      or(
        eq(memberships.userId, userId),
        sql`lower(${memberships.githubLogin}) = ${login} AND ${memberships.userId} IS NULL`,
      ),
    );
  const row = rows[0];
  return row?.owned === true && row?.unclaimed !== true;
}

/**
 * Inserts an org, treating `org.slug` as a base: `organizations_slug_uidx` is
 * global, and a caller only sees its own tenancy, so the unique slug is
 * allocated here against the whole table. Returns the org as persisted.
 */
export async function insertOrganization(
  tx: DrizzleDb,
  org: Organization,
): Promise<Organization> {
  const persisted = { ...org, slug: await allocateOrgSlug(tx, org.slug) };
  await tx.insert(organizations).values(organizationToRow(persisted));
  return persisted;
}

export async function deleteOrganizationRow(
  tx: DrizzleDb,
  orgId: string,
): Promise<void> {
  await tx.delete(organizations).where(eq(organizations.id, orgId));
}

export async function insertMembership(
  tx: DrizzleDb,
  membership: OrgMembership,
): Promise<void> {
  await tx.insert(memberships).values(membershipToRow(membership));
}

export async function upsertMembership(
  tx: DrizzleDb,
  membership: OrgMembership,
): Promise<void> {
  try {
    await upsertMembershipById(tx, membership);
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    // Cross-user concurrent writes for one login (parallel invites, or an
    // invite racing a sign-in claim) use different ids, so the id arbiter
    // misses and Postgres rejects the second writer (23505 on the real
    // unique keys). Converge onto the winning row instead of 500ing: role
    // follows the incoming write (same as a sequential double-invite), and a
    // claimed userId is never replaced — login recycling must not transfer an
    // existing membership to a new account.
    const winner = await findMembershipByOrgLogin(
      tx,
      membership.orgId,
      membership.githubLogin,
    );
    if (!winner || winner.id === membership.id) throw error;
    // Two different accounts cannot both be the claimant of one membership:
    // never rewrite another account's row (role included) from a racing write.
    if (
      winner.userId &&
      membership.userId &&
      winner.userId !== membership.userId
    ) {
      throw error;
    }
    await upsertMembershipById(tx, {
      ...winner,
      role: membership.role,
      userId: winner.userId ?? membership.userId,
      githubLogin: membership.githubLogin,
    });
  }
}

async function upsertMembershipById(
  tx: DrizzleDb,
  membership: OrgMembership,
): Promise<void> {
  await tx
    .insert(memberships)
    .values(membershipToRow(membership))
    .onConflictDoUpdate({
      target: memberships.id,
      set: {
        orgId: sql`excluded.org_id`,
        userId: sql`excluded.user_id`,
        githubLogin: sql`excluded.github_login`,
        role: sql`excluded.role`,
        payload: sql`excluded.payload`,
      },
    });
}

async function findMembershipByOrgLogin(
  tx: DrizzleDb,
  orgId: string,
  githubLogin: string,
): Promise<OrgMembership | undefined> {
  const login = githubLogin.trim().toLowerCase();
  if (!login) return undefined;
  const rows = await tx
    .select()
    .from(memberships)
    .where(
      and(
        eq(memberships.orgId, orgId),
        sql`lower(${memberships.githubLogin}) = ${login}`,
      ),
    )
    .limit(1);
  return rows[0]?.payload;
}

export async function deleteMembership(
  tx: DrizzleDb,
  membershipId: string,
): Promise<void> {
  await tx.delete(memberships).where(eq(memberships.id, membershipId));
}

export async function listOrganizationsForUser(
  drizzle: DrizzleDb,
  orgIds: readonly string[],
): Promise<Organization[]> {
  if (orgIds.length === 0) return [];
  const rows = await drizzle
    .select()
    .from(organizations)
    .where(inArray(organizations.id, [...orgIds]));
  return rows.map((row) => row.payload);
}

export async function listMembershipsForOrgs(
  drizzle: DrizzleDb,
  orgIds: readonly string[],
): Promise<OrgMembership[]> {
  if (orgIds.length === 0) return [];
  const rows = await drizzle
    .select()
    .from(memberships)
    .where(inArray(memberships.orgId, [...orgIds]));
  return rows.map((row) => row.payload);
}

/** Unclaimed invites older than this never resolve at sign-in (pruned on claim). */
export const PENDING_INVITE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** True for unclaimed invite rows past the TTL. Fail-open on bad dates. */
export function isUnclaimedInviteExpired(
  payload: OrgMembership,
  nowMs: number = Date.now(),
): boolean {
  if (payload.userId) return false;
  const created = Date.parse(payload.createdAt);
  if (!Number.isFinite(created)) return false;
  return nowMs - created > PENDING_INVITE_TTL_MS;
}

export async function claimMembershipsForLogin(
  tx: DrizzleDb,
  userId: string,
  githubLogin: string,
): Promise<boolean> {
  const login = githubLogin.trim().toLowerCase();
  if (!login) return false;
  const rows = await tx
    .select()
    .from(memberships)
    .where(sql`lower(${memberships.githubLogin}) = ${login}`);
  let changed = false;
  for (const row of rows) {
    // Only unclaimed rows may be bound to this user. A row already claimed by
    // someone else is never rebound: GitHub recycles logins, so the next
    // holder of a released login must not inherit the previous owner's org.
    if (row.payload.githubLogin.toLowerCase() === login && row.userId == null) {
      // Stale unclaimed invites never resolve: prune instead of granting a
      // months-old role.
      if (isUnclaimedInviteExpired(row.payload, Date.now())) {
        await deleteMembership(tx, row.payload.id);
        changed = true;
        continue;
      }
      const updated: OrgMembership = { ...row.payload, userId };
      await upsertMembership(tx, updated);
      changed = true;
    }
  }
  return changed;
}

async function allocateOrgSlug(
  drizzle: DrizzleDb,
  base: string,
): Promise<string> {
  const rows = await drizzle
    .select({ slug: organizations.slug })
    .from(organizations)
    .where(
      or(
        eq(organizations.slug, base),
        sql`${organizations.slug} LIKE ${`${base}-%`}`,
      ),
    );
  return nextUniqueSlug(base, new Set(rows.map((row) => row.slug)));
}

async function userOwnsOrg(
  drizzle: DrizzleDb,
  userId: string,
): Promise<boolean> {
  const rows = await drizzle
    .select({ orgId: memberships.orgId })
    .from(memberships)
    .where(and(eq(memberships.userId, userId), eq(memberships.role, "owner")))
    .limit(1);
  return rows.length > 0;
}

/**
 * Sign-in provisioning in one place: claim invite rows for this GitHub login,
 * then create a personal org + owner membership when the user does not already
 * own one. Early-returns when already provisioned (steady state).
 *
 * The whole body runs under the user's org-write advisory lock: without it,
 * concurrent first sign-ins both pass the ownership check and insert
 * duplicate personal orgs. Same key family as `withOrgWrite`, so provisioning
 * serializes against org mutations for that user.
 */
export async function provisionPersonalOrg(
  drizzle: DrizzleDb,
  userId: string,
  githubLogin: string,
): Promise<{ created: boolean }> {
  return withNamedPostgresAdvisoryLock(
    drizzle,
    orgWriteLockKey(userId),
    async (tx) => {
      if (await isPersonalOrgProvisioned(tx, userId, githubLogin)) {
        return { created: false };
      }

      await claimMembershipsForLogin(tx, userId, githubLogin);

      if (await userOwnsOrg(tx, userId)) {
        return { created: false };
      }

      const label = githubLogin.trim() || userId.slice(0, 8);
      const now = new Date().toISOString();
      const org: Organization = {
        id: crypto.randomUUID(),
        name: `${label}'s workspace`,
        slug: slugifyOrgName(label),
        createdAt: now,
      };
      const membership: OrgMembership = {
        id: crypto.randomUUID(),
        orgId: org.id,
        role: "owner",
        userId,
        githubLogin: label,
        createdAt: now,
      };

      await insertOrganization(tx, org);
      await insertMembership(tx, membership);
      return { created: true };
    },
  );
}
