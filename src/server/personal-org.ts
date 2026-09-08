import { getDrizzle } from "@complyloop/db/client";
import { provisionPersonalOrg } from "@complyloop/db/repo/orgs";

/**
 * Creates the signed-in user's personal org (owner) and claims invite rows for
 * their GitHub login. Called from auth `events.signIn` and first-write paths
 * (e.g. connect) — not from GET workspace loads.
 */
export async function ensurePersonalOrgProvisioned(
  userId: string,
  githubLogin: string,
): Promise<void> {
  await provisionPersonalOrg(await getDrizzle(), userId, githubLogin);
}
