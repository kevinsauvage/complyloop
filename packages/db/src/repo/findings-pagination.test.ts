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
  listFindingIdsForQueue,
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

  // The finding page's prev/next queue is ids-only SQL now. It must agree with
  // the paginated list for every SQL-expressible filter, or prev/next would
  // disagree with the list the user came from.
  it("returns the same ids, in the same order, as the paginated list", async () => {
    const drizzle = await getDrizzle();
    const suffix = `${Date.now()}-queue`;
    const fixture = await insertProjectSliceFixture(drizzle, suffix);
    const assessmentId = `assessment-${suffix}`;
    const base = await getFindingById(drizzle, fixture.findingOneId);
    if (!base) throw new Error("Expected seeded finding.");
    await upsertFindings(drizzle, [
      {
        ...base,
        id: `queue-critical-${suffix}`,
        severity: "critical",
        assessmentId,
      },
      { ...base, id: `queue-minor-${suffix}`, severity: "minor", assessmentId },
      {
        ...base,
        id: `queue-runtime-${suffix}`,
        severity: "moderate",
        assessmentId,
        analyzerId: "axe" as const,
      },
    ]);

    const cases: Array<{
      label: string;
      filters: Parameters<typeof listFindingsPageForProject>[2];
      queue: Parameters<typeof listFindingIdsForQueue>[2];
    }> = [
      {
        label: "open tab",
        filters: { statuses: ["open"] },
        queue: { statuses: ["open"] },
      },
      {
        label: "severity",
        filters: { statuses: ["open"], severity: "serious" },
        queue: { statuses: ["open"], severity: "serious" },
      },
      {
        label: "control",
        filters: { statuses: ["open"], controlId: fixture.controlId },
        queue: { statuses: ["open"], controlId: fixture.controlId },
      },
      {
        label: "engine",
        filters: { statuses: ["open"], engine: "runtime" },
        queue: { statuses: ["open"], engine: "runtime" },
      },
      {
        label: "remediation",
        filters: { statuses: ["open"], remediation: "suggested" },
        queue: { statuses: ["open"], remediation: "suggested" },
      },
      {
        label: "preset scope",
        filters: { statuses: ["open"], controlIds: [fixture.controlId] },
        queue: { statuses: ["open"], controlIds: [fixture.controlId] },
      },
    ];

    try {
      for (const { label, filters, queue } of cases) {
        const page = await listFindingsPageForProject(
          drizzle,
          fixture.projectId,
          { ...filters, pageSize: 100 },
        );
        const ids = await listFindingIdsForQueue(
          drizzle,
          fixture.projectId,
          queue,
        );
        expect(ids, label).toEqual(page.rows.map((finding) => finding.id));
      }
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
