import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import type { OrgMembership } from "@complyloop/analysis-core/contract/project-types";

import { closeDrizzle, getDrizzle } from "../postgres.ts";
import {
  listOrgIdsForUser,
  provisionPersonalOrg,
  upsertMembership,
} from "./orgs.ts";

/** Opt-in: needs a migrated Postgres (`DATABASE_URL`). Run via `npm run test:db`. */
const enabled = Boolean(process.env.DATABASE_URL?.trim());

function invite(
  orgId: string,
  suffix: string,
  idSuffix: string,
  role: OrgMembership["role"] = "member",
): OrgMembership {
  return {
    id: `mem-${suffix}-${idSuffix}`,
    orgId,
    role,
    githubLogin: `Invitee-${suffix}`,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

describe.skipIf(!enabled)("membership and provisioning concurrency", () => {
  afterAll(async () => {
    await closeDrizzle();
  });

  it("converges concurrent invites for one login instead of 500ing", async () => {
    const drizzle = await getDrizzle();
    const suffix = `${Date.now()}-converge`;
    const orgId = `org-${suffix}`;
    await drizzle.execute(sql`
      INSERT INTO organizations (id, slug, payload)
      VALUES (${orgId}, ${`slug-${suffix}`}, '{}'::jsonb)
    `);

    try {
      // Two writers, different ids, same login: the second hits 23505 on the
      // real unique key and must converge onto the winning row.
      await upsertMembership(drizzle, invite(orgId, suffix, "a", "member"));
      await upsertMembership(drizzle, invite(orgId, suffix, "b", "admin"));
      const rows = await drizzle.execute(sql`
        SELECT id, role FROM memberships WHERE org_id = ${orgId}
      `);
      expect(rows.length).toBe(1);
      expect((rows[0] as { role: string }).role).toBe("admin");
    } finally {
      await drizzle.execute(sql`DELETE FROM organizations WHERE id = ${orgId}`);
    }
  });

  it("never clears a claimed userId on a racing invite", async () => {
    const drizzle = await getDrizzle();
    const suffix = `${Date.now()}-claim`;
    const orgId = `org-${suffix}`;
    await drizzle.execute(sql`
      INSERT INTO organizations (id, slug, payload)
      VALUES (${orgId}, ${`slug-${suffix}`}, '{}'::jsonb)
    `);

    try {
      const claimed: OrgMembership = {
        ...invite(orgId, suffix, "a", "member"),
        userId: `user-${suffix}`,
      };
      await upsertMembership(drizzle, claimed);
      // A concurrent invite for the same login (no userId yet) converges
      // without unclaiming the member.
      await upsertMembership(drizzle, invite(orgId, suffix, "b", "viewer"));
      const rows = await drizzle.execute(sql`
        SELECT user_id, role FROM memberships WHERE org_id = ${orgId}
      `);
      expect(rows.length).toBe(1);
      const row = rows[0] as { user_id: string | null; role: string };
      expect(row.user_id).toBe(`user-${suffix}`);
      expect(row.role).toBe("viewer");
    } finally {
      await drizzle.execute(sql`DELETE FROM organizations WHERE id = ${orgId}`);
    }
  });

  it("provisions exactly one personal org under concurrent sign-ins", async () => {
    const drizzle = await getDrizzle();
    const suffix = `${Date.now()}-provision`;
    const userId = `user-${suffix}`;
    const githubLogin = `Provisionee-${suffix}`;

    try {
      const [first, second] = await Promise.all([
        provisionPersonalOrg(drizzle, userId, githubLogin),
        provisionPersonalOrg(drizzle, userId, githubLogin),
      ]);
      expect([first.created, second.created].filter(Boolean)).toHaveLength(1);

      const orgIds = await listOrgIdsForUser(drizzle, userId, githubLogin);
      expect(orgIds).toHaveLength(1);
    } finally {
      const orgIds = await listOrgIdsForUser(drizzle, userId, githubLogin);
      for (const id of orgIds) {
        await drizzle.execute(sql`DELETE FROM organizations WHERE id = ${id}`);
      }
    }
  });
});
