import { getDrizzle } from "@complyloop/db/client";
import {
  claimMembershipsForLogin,
  insertMembership,
  insertOrganization,
  isPersonalOrgProvisioned,
  listMembershipsForOrgs,
  listOrganizationsForUser,
  listOrgIdsForUser,
} from "@complyloop/db/repo/orgs";
import { emptyDb } from "@complyloop/db/types";
import { ensurePersonalOrg } from "./orgs";

/**
 * Creates the signed-in user's personal org (owner) and claims invite rows for
 * their GitHub login. Called from auth `events.signIn` and first-write paths
 * (e.g. connect) — not from GET workspace loads.
 */
export async function ensurePersonalOrgProvisioned(
  userId: string,
  githubLogin: string,
): Promise<void> {
  const drizzle = await getDrizzle();
  // Steady state (personal org exists, all login rows claimed) is one indexed
  // read and no writes.
  if (await isPersonalOrgProvisioned(drizzle, userId, githubLogin)) return;
  // Provisioning only inspects orgs + memberships — no need for a full workspace
  // load (catalog, project runtime, evidence).
  const orgIds = await listOrgIdsForUser(drizzle, userId, githubLogin);
  const [organizations, memberships] = await Promise.all([
    listOrganizationsForUser(drizzle, orgIds),
    listMembershipsForOrgs(drizzle, orgIds),
  ]);
  const orgIdsBefore = new Set(organizations.map((org) => org.id));
  const db = { ...emptyDb(), organizations, memberships };
  await claimMembershipsForLogin(drizzle, userId, githubLogin);
  const result = ensurePersonalOrg(db, userId, githubLogin);
  if (!result.changed) return;
  // Skip when the org already existed in Postgres — only persist newly created orgs.
  if (orgIdsBefore.has(result.org.id)) return;

  const membership = db.memberships.find(
    (item) => item.orgId === result.org.id && item.userId === userId,
  );
  await drizzle.transaction(async (tx) => {
    await insertOrganization(tx, result.org);
    if (membership) await insertMembership(tx, membership);
  });
}
