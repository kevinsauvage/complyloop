import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import type { Alert } from "@complyloop/analysis-core/contract/entities";

import { closeDrizzle, type DrizzleDb,getDrizzle } from "./postgres";
import { upsertAlerts } from "./repo/alerts";

/** Opt-in: needs a migrated Postgres (`DATABASE_URL`). Skipped in the default CI quality job. */
const enabled = Boolean(process.env.DATABASE_URL?.trim());

/**
 * Regression test: alert rows must be updatable through the
 * upsert path (`persistProjectRows` / `markAlertRead`) without a
 * primary-key violation, and `read`/payload must follow the latest write.
 */
describe.skipIf(!enabled)("alert upserts", () => {
  afterAll(async () => {
    await closeDrizzle();
  });

  it("updates an existing alert row instead of duplicating it", async () => {
    const drizzle = await getDrizzle();
    const suffix = `${Date.now()}`;
    const { orgId, projectId, controlId } = await insertAlertFixture(
      drizzle,
      suffix,
    );

    try {
      const alertId = `alert-${suffix}`;
      const base: Alert = {
        id: alertId,
        projectId,
        kind: "compliance_regression",
        summary: "first",
        at: "2026-01-01T00:00:00.000Z",
        read: false,
        detail: { controlId },
      };

      // Insert twice: the second write is an in-place update of the same row.
      await upsertAlerts(drizzle, [base]);
      await upsertAlerts(drizzle, [
        {
          ...base,
          summary: "second",
          read: true,
          at: "2026-01-02T00:00:00.000Z",
        },
      ]);

      const rows = await drizzle.execute(sql`
        SELECT read, payload FROM alerts WHERE id = ${alertId}
      `);
      expect(rows.length).toBe(1);
      const row = rows[0] as { read: boolean; payload: Alert };
      expect(row.read).toBe(true);
      expect(row.payload.summary).toBe("second");
    } finally {
      await drizzle.execute(sql`DELETE FROM projects WHERE id = ${projectId}`);
      await drizzle.execute(sql`DELETE FROM organizations WHERE id = ${orgId}`);
    }
  });
});

async function insertAlertFixture(
  drizzle: DrizzleDb,
  suffix: string,
): Promise<{ orgId: string; projectId: string; controlId: string }> {
  const orgId = `org-alert-${suffix}`;
  const controlId = `ctrl-alert-${suffix}`;
  const projectId = `proj-alert-${suffix}`;

  await drizzle.execute(sql`
    INSERT INTO organizations (id, slug, payload)
    VALUES (${orgId}, ${`slug-alert-${suffix}`}, '{}'::jsonb)
  `);
  await drizzle.execute(sql`
    INSERT INTO projects (id, name, org_id, payload)
    VALUES (${projectId}, 'alert-fixture', ${orgId}, '{}'::jsonb)
  `);
  return { orgId, projectId, controlId };
}
