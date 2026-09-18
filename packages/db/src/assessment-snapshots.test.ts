import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import type { Assessment } from "@complyloop/analysis-core/contract/entities";

import { closeDrizzle, getDrizzle } from "./postgres";
import {
  getLatestAssessmentSnapshot,
  insertAssessment,
} from "./repo/assessments";

/** Opt-in: needs a migrated Postgres (`DATABASE_URL`). Run via `npm run test:db`. */
const enabled = Boolean(process.env.DATABASE_URL?.trim());

/**
 * Snapshot dedup: consecutive runs over an unchanged tree store run metadata
 * with an empty hash map (`hashes_unchanged`) instead of re-storing
 * megabytes of identical hashes; readers resolve the latest full map.
 */
describe.skipIf(!enabled)("assessment snapshot dedup", () => {
  afterAll(async () => {
    await closeDrizzle();
  });

  it("stores a marker row on identical hashes and resolves the full map", async () => {
    const drizzle = await getDrizzle();
    const suffix = `${Date.now()}-snap`;
    const orgId = `org-snap-${suffix}`;
    const projectId = `proj-snap-${suffix}`;
    await drizzle.execute(sql`
      INSERT INTO organizations (id, slug, payload)
      VALUES (${orgId}, ${`slug-snap-${suffix}`}, '{}'::jsonb)
    `);
    await drizzle.execute(sql`
      INSERT INTO projects (id, name, owner_user_id, org_id, payload)
      VALUES (${projectId}, 'snap-fixture', ${`user-${suffix}`}, ${orgId}, '{}'::jsonb)
    `);

    try {
      const hashes = { "App.tsx": "abc123", "lib.ts": "def456" };
      await drizzle.transaction(async (tx) => {
        await insertAssessment(tx, testAssessment(projectId, `a1-${suffix}`, hashes, "2026-01-01T00:00:00.000Z"), {
          fileHashes: hashes,
          gitHead: "aaa",
        });
      });
      await drizzle.transaction(async (tx) => {
        await insertAssessment(tx, testAssessment(projectId, `a2-${suffix}`, hashes, "2026-01-02T00:00:00.000Z"), {
          fileHashes: { ...hashes },
          gitHead: "bbb",
        });
      });

      const marker = await drizzle.execute(sql`
        SELECT snapshot, hashes_unchanged FROM assessment_snapshots
        WHERE assessment_id = ${`a2-${suffix}`}
      `);
      expect(marker.length).toBe(1);
      const markerRow = marker[0] as {
        snapshot: { fileHashes: Record<string, string> };
        hashes_unchanged: boolean;
      };
      expect(markerRow.hashes_unchanged).toBe(true);
      expect(markerRow.snapshot.fileHashes).toEqual({});

      const resolved = await getLatestAssessmentSnapshot(drizzle, projectId);
      expect(resolved?.fileHashes).toEqual(hashes);
      expect(resolved?.gitHead).toBe("bbb");

      await drizzle.transaction(async (tx) => {
        await insertAssessment(
          tx,
          testAssessment(projectId, `a3-${suffix}`, { "App.tsx": "changed" }, "2026-01-03T00:00:00.000Z"),
          { fileHashes: { "App.tsx": "changed" }, gitHead: "ccc" },
        );
      });
      const resolvedAfterChange = await getLatestAssessmentSnapshot(
        drizzle,
        projectId,
      );
      expect(resolvedAfterChange?.fileHashes).toEqual({ "App.tsx": "changed" });
    } finally {
      await drizzle.execute(
        sql`DELETE FROM assessments WHERE project_id = ${projectId}`,
      );
      await drizzle.execute(
        sql`DELETE FROM projects WHERE id = ${projectId}`,
      );
      await drizzle.execute(
        sql`DELETE FROM organizations WHERE id = ${orgId}`,
      );
    }
  });
});

function testAssessment(
  projectId: string,
  id: string,
  hashes: Record<string, string>,
  completedAt: string,
): Assessment {
  return {
    id,
    projectId,
    startedAt: completedAt,
    completedAt,
    filesScanned: Object.keys(hashes).length,
    scanMode: "full",
    summary: { passed: 0, failed: 0, needs_review: 0, not_applicable: 0, unable_to_verify: 0 },
    snapshot: { fileHashes: hashes },
    changesSincePrevious: [],
  };
}
