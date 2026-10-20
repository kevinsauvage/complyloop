import { afterAll, describe, expect, it } from "vitest";

import type {
  Assessment,
  AssessmentSnapshot,
  Finding,
} from "@complyloop/analysis-core/contract/entities";

import { closeDrizzle, getDrizzle } from "../postgres.ts";
import {
  cleanupProjectSliceFixture,
  insertProjectSliceFixture,
} from "../test-fixtures/project-slice-fixture.ts";
import {
  insertAssessment,
  listLatestAssessmentForProject,
} from "./assessments.ts";
import {
  countsOfOpenFindingsDetectedAfterForControls,
  getFindingById,
  upsertFindings,
} from "./findings.ts";

/**
 * Opt-in: needs a migrated Postgres (`DATABASE_URL`). Run via `npm run test:db`.
 *
 * These pin the reason the columns are typed (drizzle/0006): comparing or
 * ordering the JSONB text was only correct for UTC `Z` strings. A payload with
 * a numeric offset sorts differently as text and as an instant, so each case
 * below would pass with the old query and fail if the column stops being used.
 */
const enabled = Boolean(process.env.DATABASE_URL?.trim());

describe.skipIf(!enabled)("typed query columns", () => {
  afterAll(async () => {
    await closeDrizzle();
  });

  it("counts re-arm findings by instant, not by payload text", async () => {
    const drizzle = await getDrizzle();
    const suffix = `${Date.now()}-typed-detected`;
    const fixture = await insertProjectSliceFixture(drizzle, suffix);
    const base = await getFindingById(drizzle, fixture.findingOneId);
    if (!base) throw new Error("Expected seeded finding.");

    const offsetFinding: Finding = {
      ...base,
      id: `finding-offset-${suffix}`,
      status: "open",
      // 23:00+02:00 == 21:00Z: later as text, earlier as an instant than the
      // 22:00Z cutoff below.
      detectedAt: "2026-01-01T23:00:00+02:00",
    };
    await upsertFindings(drizzle, [offsetFinding]);

    try {
      const counts = await countsOfOpenFindingsDetectedAfterForControls(
        drizzle,
        fixture.projectId,
        [fixture.controlId],
        new Date("2026-01-01T22:00:00.000Z"),
      );
      expect(counts.get(fixture.controlId) ?? 0).toBe(0);

      const beforeOffset = await countsOfOpenFindingsDetectedAfterForControls(
        drizzle,
        fixture.projectId,
        [fixture.controlId],
        new Date("2026-01-01T20:00:00.000Z"),
      );
      expect(beforeOffset.get(fixture.controlId) ?? 0).toBeGreaterThan(0);
    } finally {
      await cleanupProjectSliceFixture(drizzle, fixture);
    }
  });

  it("orders assessments by instant, not by payload text", async () => {
    const drizzle = await getDrizzle();
    const suffix = `${Date.now()}-typed-completed`;
    const fixture = await insertProjectSliceFixture(drizzle, suffix);
    const snapshot: AssessmentSnapshot = { fileHashes: {} };
    const summary = {
      passed: 0,
      failed: 0,
      needs_review: 0,
      not_applicable: 0,
      unable_to_verify: 0,
    };

    const older: Assessment = {
      id: `assessment-offset-${suffix}`,
      projectId: fixture.projectId,
      // 23:30+02:00 == 21:30Z: the latest run as text, the older instant.
      startedAt: "2026-01-01T23:00:00+02:00",
      completedAt: "2026-01-01T23:30:00+02:00",
      filesScanned: 1,
      summary,
    };
    const newer: Assessment = {
      id: `assessment-newer-${suffix}`,
      projectId: fixture.projectId,
      // 22:00Z: earlier as text than "23:30…", later as an instant.
      startedAt: "2026-01-01T21:00:00.000Z",
      completedAt: "2026-01-01T22:00:00.000Z",
      filesScanned: 1,
      summary,
    };
    await insertAssessment(drizzle, older, snapshot);
    await insertAssessment(drizzle, newer, snapshot);

    try {
      const [latest] = await listLatestAssessmentForProject(
        drizzle,
        fixture.projectId,
      );
      expect(latest?.id).toBe(newer.id);
    } finally {
      await cleanupProjectSliceFixture(drizzle, fixture);
    }
  });
});
