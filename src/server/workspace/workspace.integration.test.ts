import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { closeDrizzle, getDrizzle } from "@complyloop/db/postgres";
import { getFindingById, upsertFindings } from "@complyloop/db/repo/findings";
import { upsertRequirements } from "@complyloop/db/repo/requirements";
import { findings, requirements } from "@complyloop/db/schema";
import {
  cleanupProjectSliceFixture,
  insertProjectSliceFixture,
  loadProjectSlice,
} from "@complyloop/db/test-fixtures/project-slice-fixture";

const auth = vi.hoisted(() => vi.fn());
const readActiveOrgCookie = vi.hoisted(() => vi.fn());

vi.mock("@/auth", () => ({ auth }));
vi.mock("./active-cookies", () => ({
  readActiveOrgCookie,
}));

import { withProjectTx } from "./workspace-write";

/** Opt-in: needs a migrated Postgres (`DATABASE_URL`). Run via `npm run test:db`. */
const enabled = Boolean(process.env.DATABASE_URL?.trim());

describe.skipIf(!enabled)("withProjectTx postgres integration", () => {
  afterAll(async () => {
    await closeDrizzle();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function signInAs(fixture: {
    userId: string;
    githubLogin: string;
    orgId: string;
    projectId: string;
  }) {
    auth.mockResolvedValue({
      user: { id: fixture.userId, login: fixture.githubLogin },
    });
    readActiveOrgCookie.mockResolvedValue(fixture.orgId);
  }

  it("persists a targeted finding write through the real transaction", async () => {
    const drizzle = await getDrizzle();
    const suffix = `${Date.now()}-workspace`;
    const fixture = await insertProjectSliceFixture(drizzle, suffix);
    await signInAs(fixture);

    try {
      await withProjectTx(
        fixture.projectId,
        "project.remediate",
        async ({ tx }) => {
          const finding = await getFindingById(tx, fixture.findingOneId);
          if (!finding) throw new Error("Expected seeded finding.");
          await upsertFindings(tx, [{ ...finding, status: "dismissed" }]);
        },
      );

      const rows = await drizzle
        .select({ payload: findings.payload })
        .from(findings)
        .where(eq(findings.id, fixture.findingOneId));
      expect(rows).toHaveLength(1);
      expect(rows[0]?.payload.status).toBe("dismissed");
    } finally {
      await drizzle.execute(sql`
        DELETE FROM evidence WHERE project_id = ${fixture.projectId}
      `);
      await cleanupProjectSliceFixture(drizzle, fixture);
    }
  });

  // The write model's central claim: the per-project advisory lock serialises
  // writers, so a read-modify-write inside the transaction is atomic and the
  // removed `updatedAt` guard is not needed.
  it("serialises concurrent writes so both land and the second sees the first", async () => {
    const drizzle = await getDrizzle();
    const suffix = `${Date.now()}-concurrent`;
    const fixture = await insertProjectSliceFixture(drizzle, suffix);
    await signInAs(fixture);

    const dismissAndReadSibling = (dismissId: string, siblingId: string) =>
      withProjectTx(fixture.projectId, "project.remediate", async ({ tx }) => {
        const target = await getFindingById(tx, dismissId);
        if (!target) throw new Error("Expected seeded finding.");
        // Reading a sibling row after the lock proves this transaction sees the
        // other writer's committed work.
        const sibling = await getFindingById(tx, siblingId);
        await upsertFindings(tx, [{ ...target, status: "dismissed" }]);
        return sibling?.status;
      });

    try {
      const [firstSaw, secondSaw] = await Promise.all([
        dismissAndReadSibling(fixture.findingOneId, fixture.findingTwoId),
        dismissAndReadSibling(fixture.findingTwoId, fixture.findingOneId),
      ]);

      // Both rows persisted (no lost update).
      const rows = await drizzle
        .select({ id: findings.id, payload: findings.payload })
        .from(findings)
        .where(eq(findings.projectId, fixture.projectId));
      const statusById = new Map(
        rows.map((row) => [row.id, row.payload.status]),
      );
      expect(statusById.get(fixture.findingOneId)).toBe("dismissed");
      expect(statusById.get(fixture.findingTwoId)).toBe("dismissed");

      // Exactly one of the two transactions ran second and saw the other's
      // dismissal; the first necessarily saw the pre-write status.
      expect(
        [firstSaw, secondSaw].filter((seen) => seen === "dismissed"),
      ).toHaveLength(1);
    } finally {
      await drizzle.execute(sql`
        DELETE FROM evidence WHERE project_id = ${fixture.projectId}
      `);
      await cleanupProjectSliceFixture(drizzle, fixture);
    }
  });

  // `refreshRequirementsForControls` converges on the composite arbiter
  // `(project_id, control_id)` rather than a row id: two writers that each
  // created a fresh in-memory requirement for one control must end on one row.
  it("collapses two fresh-id requirement creates for one control into one row", async () => {
    const drizzle = await getDrizzle();
    const suffix = `${Date.now()}-requirement-collapse`;
    const fixture = await insertProjectSliceFixture(drizzle, suffix);

    try {
      await drizzle.execute(
        sql`DELETE FROM requirements WHERE id = ${fixture.requirementId}`,
      );

      const base = {
        projectId: fixture.projectId,
        controlId: fixture.controlId,
        status: "failed" as const,
        determination: "automated" as const,
      };
      await upsertRequirements(drizzle, [
        {
          ...base,
          id: `dup-a-${suffix}`,
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ]);
      await upsertRequirements(drizzle, [
        {
          ...base,
          id: `dup-b-${suffix}`,
          status: "passed",
          updatedAt: "2026-01-02T00:00:00.000Z",
        },
      ]);

      const rows = await drizzle
        .select({ id: requirements.id, payload: requirements.payload })
        .from(requirements)
        .where(eq(requirements.projectId, fixture.projectId));
      expect(rows).toHaveLength(1);
      expect(rows[0]?.id).toBe(`dup-b-${suffix}`);
      expect(rows[0]?.payload.status).toBe("passed");
    } finally {
      await cleanupProjectSliceFixture(drizzle, fixture);
    }
  });

  // A write is applied unconditionally now: `updatedAt` is a last-write stamp,
  // not a guard. Protection comes from every writer holding the project lock.
  it("applies a write even when its updatedAt predates the stored row", async () => {
    const drizzle = await getDrizzle();
    const suffix = `${Date.now()}-nostale`;
    const fixture = await insertProjectSliceFixture(drizzle, suffix);

    try {
      const slice = await loadProjectSlice(drizzle, fixture.projectId);
      const stored = slice.findings.find(
        (item) => item.id === fixture.findingOneId,
      )!;

      await upsertFindings(drizzle, [
        {
          ...stored,
          status: "dismissed",
          updatedAt: "2000-01-01T00:00:00.000Z",
        },
      ]);

      const persisted = await loadProjectSlice(drizzle, fixture.projectId);
      expect(
        persisted.findings.find((item) => item.id === fixture.findingOneId)
          ?.status,
      ).toBe("dismissed");
    } finally {
      await cleanupProjectSliceFixture(drizzle, fixture);
    }
  });
});
