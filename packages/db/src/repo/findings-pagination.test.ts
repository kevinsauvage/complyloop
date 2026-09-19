import { afterAll, describe, expect, it } from "vitest";

import { closeDrizzle, getDrizzle } from "../postgres.ts";
import {
  cleanupProjectSliceFixture,
  insertProjectSliceFixture,
} from "../test-fixtures/project-slice-fixture.ts";
import {
  countFindingsByStatusForList,
  countOpenFindingsByControlForProject,
  getFindingById,
  listFindingsForProject,
  listFindingsPageForProject,
  upsertFindings,
} from "./findings.ts";
import { listRemediationsForFindings } from "./remediations.ts";

/** Opt-in: needs a migrated Postgres (`DATABASE_URL`). Run via `npm run test:db`. */
const enabled = Boolean(process.env.DATABASE_URL?.trim());

describe.skipIf(!enabled)("findings pagination and bounded loads", () => {
  afterAll(async () => {
    await closeDrizzle();
  });

  it("pages severity-first with exact totals and filters", async () => {
    const drizzle = await getDrizzle();
    const suffix = `${Date.now()}-pagination`;
    const fixture = await insertProjectSliceFixture(drizzle, suffix);
    const assessmentId = `assessment-${suffix}`;
    // Fixture seeds two open serious findings; add the severity spread plus
    // one resolved row so ordering, filters, and counts are all exercised.
    const seed = getFindingById;
    const base = await seed(drizzle, fixture.findingOneId);
    if (!base) throw new Error("Expected seeded finding.");
    const extra = (
      id: string,
      severity: "critical" | "moderate" | "minor",
      status: "open" | "resolved" = "open",
    ) => ({ ...base, id, severity, status, assessmentId });
    await upsertFindings(drizzle, [
      extra(`finding-critical-${suffix}`, "critical"),
      extra(`finding-minor-${suffix}`, "minor"),
      extra(`finding-resolved-${suffix}`, "minor", "resolved"),
      {
        ...base,
        id: `finding-runtime-${suffix}`,
        severity: "moderate",
        assessmentId,
        analyzerId: "axe" as const,
      },
    ]);

    try {
      const first = await listFindingsPageForProject(
        drizzle,
        fixture.projectId,
        {
          statuses: ["open"],
          page: 1,
          pageSize: 2,
        },
      );
      expect(first.total).toBe(5);
      expect(first.rows.map((finding) => finding.id)).toEqual([
        `finding-critical-${suffix}`,
        fixture.findingOneId,
      ]);

      const second = await listFindingsPageForProject(
        drizzle,
        fixture.projectId,
        { statuses: ["open"], page: 2, pageSize: 2 },
      );
      expect(second.total).toBe(5);
      expect(second.rows.map((finding) => finding.id)).toEqual([
        fixture.findingTwoId,
        `finding-runtime-${suffix}`,
      ]);

      const serious = await listFindingsPageForProject(
        drizzle,
        fixture.projectId,
        { statuses: ["open"], severity: "serious" },
      );
      expect(serious.total).toBe(2);

      const control = await listFindingsPageForProject(
        drizzle,
        fixture.projectId,
        { controlId: fixture.controlId },
      );
      expect(control.total).toBe(6);

      const runtime = await listFindingsPageForProject(
        drizzle,
        fixture.projectId,
        { statuses: ["open"], engine: "runtime" },
      );
      expect(runtime.total).toBe(1);
      expect(runtime.rows.map((finding) => finding.id)).toEqual([
        `finding-runtime-${suffix}`,
      ]);

      const suggested = await listFindingsPageForProject(
        drizzle,
        fixture.projectId,
        { statuses: ["open"], remediation: "suggested" },
      );
      expect(suggested.total).toBe(2);

      const counts = await countFindingsByStatusForList(
        drizzle,
        fixture.projectId,
        {},
      );
      expect(counts).toMatchObject({ open: 5, resolved: 1, dismissed: 0 });
      const criticalCounts = await countFindingsByStatusForList(
        drizzle,
        fixture.projectId,
        { severity: "critical" },
      );
      expect(criticalCounts).toMatchObject({ open: 1, resolved: 0 });

      const byControl = await countOpenFindingsByControlForProject(
        drizzle,
        fixture.projectId,
      );
      expect(byControl.get(fixture.controlId)).toBe(5);
    } finally {
      await cleanupProjectSliceFixture(drizzle, fixture);
    }
  });

  it("caps full loads least-severe-first and scopes remediations", async () => {
    const drizzle = await getDrizzle();
    const suffix = `${Date.now()}-bounded`;
    const fixture = await insertProjectSliceFixture(drizzle, suffix);
    const assessmentId = `assessment-${suffix}`;
    const base = await getFindingById(drizzle, fixture.findingOneId);
    if (!base) throw new Error("Expected seeded finding.");
    await upsertFindings(drizzle, [
      {
        ...base,
        id: `finding-critical-${suffix}`,
        severity: "critical",
        assessmentId,
      },
      {
        ...base,
        id: `finding-minor-${suffix}`,
        severity: "minor",
        assessmentId,
      },
    ]);

    try {
      const capped = await listFindingsForProject(drizzle, fixture.projectId, {
        statuses: ["open"],
        limit: 2,
      });
      expect(capped.map((finding) => finding.id)).toEqual([
        `finding-critical-${suffix}`,
        fixture.findingOneId,
      ]);

      const scoped = await listRemediationsForFindings(drizzle, [
        fixture.findingOneId,
      ]);
      expect(scoped.map((remediation) => remediation.id)).toEqual([
        fixture.remediationOneId,
      ]);
      expect(await listRemediationsForFindings(drizzle, [])).toEqual([]);
    } finally {
      await cleanupProjectSliceFixture(drizzle, fixture);
    }
  });
});
