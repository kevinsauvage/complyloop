import { eq, inArray, or, sql } from "drizzle-orm";
import type { OrgMembership, Organization } from "@complyloop/domain/project-types";
import type { DrizzleDb } from "../client.ts";
import { memberships, organizations } from "../schema.ts";
import { membershipToRow, organizationToRow } from "./mappers.ts";

/**
 * One indexed read answering "is there anything left to provision for this
 * viewer?": the user owns an org (personal org exists) and no membership row
 * for their login is still unclaimed. Lets the signed-in GET path skip the
 * heavier provisioning load + claim writes entirely (P1-2).
 */
export async function isPersonalOrgProvisioned(
  drizzle: DrizzleDb,
  userId: string,
  githubLogin: string,
): Promise<boolean> {
  const login = githubLogin.trim().toLowerCase();
  if (!login) return false;
  const rows = await drizzle
    .select({
      owned: sql<boolean | null>`bool_or(${memberships.userId} = ${userId} AND ${memberships.role} = 'owner')`,
      unclaimed: sql<boolean | null>`bool_or(lower(${memberships.githubLogin}) = ${login} AND (${memberships.userId} IS NULL OR ${memberships.userId} <> ${userId}))`,
    })
    .from(memberships)
    .where(
      or(
        eq(memberships.userId, userId),
        sql`lower(${memberships.githubLogin}) = ${login}`,
      ),
    );
  const row = rows[0];
  return row?.owned === true && row?.unclaimed !== true;
}

export async function insertOrganization(
  tx: DrizzleDb,
  org: Organization,
): Promise<void> {
  await tx.insert(organizations).values(organizationToRow(org));
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
    if (row.payload.githubLogin.toLowerCase() === login && row.userId !== userId) {
      const updated: OrgMembership = { ...row.payload, userId };
      await upsertMembership(tx, updated);
      changed = true;
    }
  }
  return changed;
}
