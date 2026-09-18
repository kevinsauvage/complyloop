import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { closeDrizzle, getDrizzle } from "./postgres";
import { findProjectsByGithubFullName } from "./repo/projects";

/** Opt-in: needs a migrated Postgres (`DATABASE_URL`). Run via `npm run test:db`. */
const enabled = Boolean(process.env.DATABASE_URL?.trim());

/**
 * The webhook resolves same-named projects by installation id — the lookup
 * must return every per-org match in deterministic order, never one
 * arbitrary row.
 */
describe.skipIf(!enabled)("project github lookup", () => {
  afterAll(async () => {
    await closeDrizzle();
  });

  it("returns all org matches for a shared repo in id order", async () => {
    const drizzle = await getDrizzle();
    const suffix = `${Date.now()}-lookup`;
    const orgA = `org-lookup-a-${suffix}`;
    const orgB = `org-lookup-b-${suffix}`;
    const projectB = `proj-lookup-b-${suffix}`;
    const projectA = `proj-lookup-a-${suffix}`;
    const fullName = `Acme/Shared-${suffix}`;

    await drizzle.execute(sql`
      INSERT INTO organizations (id, slug, payload)
      VALUES
        (${orgA}, ${`slug-a-${suffix}`}, '{}'::jsonb),
        (${orgB}, ${`slug-b-${suffix}`}, '{}'::jsonb)
    `);
    // Insert B first so id order differs from insert order.
    await drizzle.execute(sql`
      INSERT INTO projects (id, name, owner_user_id, org_id, payload)
      VALUES (
        ${projectB},
        'shared-b',
        ${`user-${suffix}`},
        ${orgB},
        ${JSON.stringify({ github: { fullName, installationId: 222 } })}::jsonb
      )
    `);
    await drizzle.execute(sql`
      INSERT INTO projects (id, name, owner_user_id, org_id, payload)
      VALUES (
        ${projectA},
        'shared-a',
        ${`user-${suffix}`},
        ${orgA},
        ${JSON.stringify({ github: { fullName, installationId: 111 } })}::jsonb
      )
    `);

    try {
      const matches = await findProjectsByGithubFullName(
        drizzle,
        fullName.toUpperCase(),
      );
      expect(matches.map((match) => match.id)).toEqual(
        [projectA, projectB].sort(),
      );
      expect(
        matches.find((match) => match.id === projectA)?.installationId,
      ).toBe(111);
      expect(
        matches.find((match) => match.id === projectB)?.installationId,
      ).toBe(222);
    } finally {
      await drizzle.execute(
        sql`DELETE FROM projects WHERE id IN (${projectA}, ${projectB})`,
      );
      await drizzle.execute(
        sql`DELETE FROM organizations WHERE id IN (${orgA}, ${orgB})`,
      );
    }
  });
});
