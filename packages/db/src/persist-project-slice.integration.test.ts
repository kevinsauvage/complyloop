import { afterAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import type { EvidenceRecord } from "@complyloop/analysis-core/contract/finding-types";
import { closeDrizzle, getDrizzle } from "./client";
import { persistProjectSliceDiff } from "./repo/apply";
import { upsertRequirements } from "./repo/requirements";
import { requirements } from "./schema";
import {
  cleanupProjectSliceFixture,
  insertProjectSliceFixture,
  loadProjectSlice,
  sliceFingerprint,
  type ProjectSliceFixture,
} from "./test-fixtures/project-slice-fixture";
import {
  acquireNamedPostgresAdvisoryLock,
  projectWriteLockKey,
} from "./write-lock";

/** Opt-in: needs a migrated Postgres (`DATABASE_URL`). Run via `npm run test:db`. */
const enabled = Boolean(process.env.DATABASE_URL?.trim());

describe.skipIf(!enabled)("persistProjectSliceDiff integration", () => {
  afterAll(async () => {
    await closeDrizzle();
  });

  it("updates each runtime entity through the diff path", async () => {
    const drizzle = await getDrizzle();
    const suffix = `${Date.now()}-entities`;
    const fixture = await insertProjectSliceFixture(drizzle, suffix);

    try {
      const before = await loadProjectSlice(drizzle, fixture.projectId);
      const after = structuredClone(before);
      const requirement = after.requirements[0]!;
      requirement.status = "passed";
      requirement.determination = "human_review";
      requirement.updatedAt = "2026-01-02T00:00:00.000Z";
      requirement.humanPass = {
        note: "verified manually",
        at: requirement.updatedAt,
      };

      const finding = after.findings.find(
        (item) => item.id === fixture.findingOneId,
      )!;
      finding.status = "dismissed";

      const remediation = after.remediations.find(
        (item) => item.id === fixture.remediationOneId,
      )!;
      remediation.status = "approved";

      const alert = after.alerts[0]!;
      alert.read = true;
      alert.summary = "acknowledged";

      const evidenceRows: EvidenceRecord[] = [
        {
          id: `evidence-${suffix}`,
          at: "2026-01-02T00:00:00.000Z",
          kind: "finding_dismissed",
          summary: "dismissed in integration test",
          projectId: fixture.projectId,
          findingId: fixture.findingOneId,
        },
      ];

      await drizzle.transaction(async (tx) => {
        await persistProjectSliceDiff(tx, before, after, evidenceRows);
      });

      const persisted = await loadProjectSlice(drizzle, fixture.projectId);
      expect(persisted.requirements[0]?.status).toBe("passed");
      expect(
        persisted.findings.find((item) => item.id === fixture.findingOneId)
          ?.status,
      ).toBe("dismissed");
      expect(
        persisted.remediations.find((item) => item.id === fixture.remediationOneId)
          ?.status,
      ).toBe("approved");
      expect(persisted.alerts[0]?.read).toBe(true);
      expect(persisted.alerts[0]?.summary).toBe("acknowledged");

      const evidenceResult = await drizzle.execute(sql`
        SELECT summary FROM evidence WHERE id = ${`evidence-${suffix}`}
      `);
      expect(evidenceResult).toHaveLength(1);
    } finally {
      await cleanupProjectSliceFixture(drizzle, fixture);
    }
  });

  it("leaves rows unchanged when before and after are identical", async () => {
    const drizzle = await getDrizzle();
    const suffix = `${Date.now()}-noop`;
    const fixture = await insertProjectSliceFixture(drizzle, suffix);

    try {
      const before = await loadProjectSlice(drizzle, fixture.projectId);
      const fingerprintBefore = sliceFingerprint(before);

      await drizzle.transaction(async (tx) => {
        await persistProjectSliceDiff(tx, before, structuredClone(before), []);
      });

      const after = await loadProjectSlice(drizzle, fixture.projectId);
      expect(sliceFingerprint(after)).toBe(fingerprintBefore);
    } finally {
      await cleanupProjectSliceFixture(drizzle, fixture);
    }
  });

  it("serializes concurrent slice writes so both finding updates persist", async () => {
    const drizzle = await getDrizzle();
    const suffix = `${Date.now()}-concurrent`;
    const fixture = await insertProjectSliceFixture(drizzle, suffix);

    try {
      await Promise.all([
        runLockedProjectSliceWrite(drizzle, fixture, (slice, ids) =>
          dismissFinding(
            slice,
            ids.findingOneId,
            ids.remediationOneId,
          ),
        ),
        runLockedProjectSliceWrite(drizzle, fixture, (slice, ids) =>
          dismissFinding(
            slice,
            ids.findingTwoId,
            ids.remediationTwoId,
          ),
        ),
      ]);

      const finalSlice = await loadProjectSlice(drizzle, fixture.projectId);
      expect(
        finalSlice.findings.find((item) => item.id === fixture.findingOneId)
          ?.status,
      ).toBe("dismissed");
      expect(
        finalSlice.findings.find((item) => item.id === fixture.findingTwoId)
          ?.status,
      ).toBe("dismissed");
      expect(
        finalSlice.remediations.find((item) => item.id === fixture.remediationOneId)
          ?.status,
      ).toBe("approved");
      expect(
        finalSlice.remediations.find((item) => item.id === fixture.remediationTwoId)
          ?.status,
      ).toBe("approved");
    } finally {
      await cleanupProjectSliceFixture(drizzle, fixture);
    }
  });

  it("skips requirement upserts when the DB row is newer than the loaded snapshot", async () => {
    const drizzle = await getDrizzle();
    const suffix = `${Date.now()}-stale`;
    const fixture = await insertProjectSliceFixture(drizzle, suffix);

    try {
      const loadedAt = "2026-01-01T00:00:00.000Z";
      const newerAt = "2026-01-02T00:00:00.000Z";
      const requirement = {
        id: fixture.requirementId,
        projectId: fixture.projectId,
        controlId: fixture.controlId,
        status: "failed" as const,
        determination: "automated" as const,
        updatedAt: loadedAt,
      };

      await upsertRequirements(drizzle, [
        {
          ...requirement,
          status: "passed",
          determination: "human_review",
          updatedAt: newerAt,
          humanPass: { note: "verified manually", at: newerAt },
        },
      ]);

      await upsertRequirements(
        drizzle,
        [
          {
            ...requirement,
            status: "failed",
            determination: "automated",
            updatedAt: "2026-01-03T00:00:00.000Z",
          },
        ],
        { loadedUpdatedAtById: new Map([[requirement.id, loadedAt]]) },
      );

      const rows = await drizzle
        .select({ payload: requirements.payload })
        .from(requirements)
        .where(eq(requirements.id, fixture.requirementId));
      expect(rows).toHaveLength(1);
      expect(rows[0]?.payload.status).toBe("passed");
      expect(rows[0]?.payload.updatedAt).toBe(newerAt);
    } finally {
      await cleanupProjectSliceFixture(drizzle, fixture);
    }
  });
});

async function runLockedProjectSliceWrite(
  drizzle: Awaited<ReturnType<typeof getDrizzle>>,
  fixture: ProjectSliceFixture,
  mutate: (
    slice: Awaited<ReturnType<typeof loadProjectSlice>>,
    fixture: ProjectSliceFixture,
  ) => Awaited<ReturnType<typeof loadProjectSlice>>,
): Promise<void> {
  await drizzle.transaction(async (tx) => {
    await acquireNamedPostgresAdvisoryLock(tx, projectWriteLockKey(fixture.projectId));
    const before = await loadProjectSlice(tx, fixture.projectId);
    const after = mutate(structuredClone(before), fixture);
    await persistProjectSliceDiff(tx, before, after, []);
  });
}

function dismissFinding(
  slice: Awaited<ReturnType<typeof loadProjectSlice>>,
  findingId: string,
  remediationId: string,
) {
  return {
    ...slice,
    findings: slice.findings.map((finding) =>
      finding.id === findingId ? { ...finding, status: "dismissed" as const } : finding,
    ),
    remediations: slice.remediations.map((remediation) =>
      remediation.id === remediationId
        ? { ...remediation, status: "approved" as const }
        : remediation,
    ),
  };
}
