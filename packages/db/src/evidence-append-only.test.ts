import { afterAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { closeDrizzle, getDrizzle } from "./postgres";

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
});
