import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { closeDrizzle, getDrizzle } from "./postgres";
import { deleteEvidenceForOrg } from "./repo/evidence";

/** Opt-in: needs a migrated Postgres (`DATABASE_URL`) and avoids stealing the pool during the default suite. */
const enabled = Boolean(process.env.DATABASE_URL?.trim());

describe.skipIf(!enabled)("evidence append-only DB trigger", () => {
  afterAll(async () => {
    await closeDrizzle();
  });

  it("rejects UPDATE and DELETE on evidence", async () => {
    const drizzle = await getDrizzle();
    const id = `evidence-append-only-${Date.now()}`;
    await drizzle.execute(sql`
      INSERT INTO evidence (id, at, kind, summary)
      VALUES (${id}, NOW(), 'assessment_completed', 'trigger-test')
    `);

    await expect(
      drizzle.execute(sql`
        UPDATE evidence SET summary = 'mutated' WHERE id = ${id}
      `),
    ).rejects.toThrow(/append-only/i);

    await expect(
      drizzle.execute(sql`
        DELETE FROM evidence WHERE id = ${id}
      `),
    ).rejects.toThrow(/append-only/i);

    // Cleanup is blocked by the same trigger — leave the row; unique id keeps
    // the table from accumulating collisions in repeated local runs.
  });

  it("erases an org's evidence only through the gated helper", async () => {
    const drizzle = await getDrizzle();
    const suffix = `${Date.now()}-erase`;
    const orgId = `org-erase-${suffix}`;
    const projectId = `proj-erase-${suffix}`;
    await drizzle.execute(sql`
      INSERT INTO organizations (id, slug, payload)
      VALUES (${orgId}, ${`slug-erase-${suffix}`}, '{}'::jsonb)
    `);
    await drizzle.execute(sql`
      INSERT INTO projects (id, name, owner_user_id, org_id, payload)
      VALUES (${projectId}, 'erase-fixture', ${`user-${suffix}`}, ${orgId}, '{}'::jsonb)
    `);
    await drizzle.execute(sql`
      INSERT INTO evidence (id, at, kind, summary, project_id)
      VALUES (${`evidence-erase-${suffix}`}, NOW(), 'assessment_completed', 'erase-test', ${projectId})
    `);

    try {
      // Plain DELETE stays forbidden even for tenant rows (postgres.js wraps
      // the failure — unwrap the cause chain like constraints.test.ts).
      await expect(
        unwrapDbError(
          drizzle.execute(
            sql`DELETE FROM evidence WHERE project_id = ${projectId}`,
          ),
        ),
      ).rejects.toThrow(/append-only/i);

      const erased = await drizzle.transaction(async (tx) => {
        return deleteEvidenceForOrg(tx, orgId);
      });
      expect(erased).toBe(1);

      const leftover = await drizzle.execute(sql`
        SELECT id FROM evidence WHERE project_id = ${projectId}
      `);
      expect(leftover.length).toBe(0);
    } finally {
      await drizzle.execute(sql`DELETE FROM projects WHERE id = ${projectId}`);
      await drizzle.execute(sql`DELETE FROM organizations WHERE id = ${orgId}`);
    }
  });
});

/** postgres.js surfaces DB failures as generic `Error("Failed query:…")` with the real PostgresError as `cause`. */
async function unwrapDbError(run: Promise<unknown>): Promise<never> {
  try {
    await run;
  } catch (error) {
    let current: unknown = error;
    while (
      current instanceof Error &&
      current.cause &&
      current.cause !== current
    ) {
      current = current.cause;
    }
    throw new Error(
      current instanceof Error ? current.message : String(current),
    );
  }
  throw new Error("expected query to throw");
}
