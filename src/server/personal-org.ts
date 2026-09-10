import { getDrizzle } from "@complyloop/db/postgres";
import { provisionPersonalOrg } from "@complyloop/db/repo/orgs";

/**
 * Creates the signed-in user's personal org (owner) and claims invite rows for
 * their GitHub login. Called from auth `events.signIn`, connect, and (via
 * `provisionPersonalOrg` inside `loadWorkspaceTenancy`) ordinary workspace
 * loads so pending invites attach without re-auth.
 */
export async function ensurePersonalOrgProvisioned(
  userId: string,
  githubLogin: string,
): Promise<void> {
  await provisionPersonalOrg(await getDrizzle(), userId, githubLogin);
}
