import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import type { EvidenceRecord } from "@complyloop/analysis-core/contract/entities";

import {
  acquireNamedPostgresAdvisoryLock,
  closeDrizzle,
  getDrizzle,
  projectWriteLockKey,
} from "./postgres";
import {
  persistProjectRows,
  snapshotProjectSlice,
  updatedAtById,
} from "./repo/apply";
import { upsertFindings } from "./repo/findings";
import { upsertRemediations } from "./repo/remediations";
import { upsertRequirements } from "./repo/requirements";
import { requirements } from "./schema";
import {
  cleanupProjectSliceFixture,
  insertProjectSliceFixture,
  loadProjectSlice,
  type ProjectSliceFixture,
  sliceFingerprint,
} from "./test-fixtures/project-slice-fixture";

/** Opt-in: needs a migrated Postgres (`DATABASE_URL`). Run via `npm run test:db`. */
const enabled = Boolean(process.env.DATABASE_URL?.trim());

/** Builds the persistProjectRows payload + stale guards from a loaded slice. */
function slicePayload(
  loaded: Awaited<ReturnType<typeof loadProjectSlice>>,
  after: Awaited<ReturnType<typeof loadProjectSlice>>,
  evidence: ReadonlyArray<EvidenceRecord> = [],
): {
  payload: Parameters<typeof persistProjectRows>[1];
  options: Parameters<typeof persistProjectRows>[2];
} {
  return {
    payload: {
      requirements: after.requirements,
      findings: after.findings,
      remediations: after.remediations,
      alerts: after.alerts,
      evidence: [...evidence],
    },
    options: { loadedSlice: loaded },
  };
}

describe.skipIf(!enabled)("persistProjectRows integration", () => {
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
          kind: "finding",
          summary: "dismissed in integration test",
          projectId: fixture.projectId,
          findingId: fixture.findingOneId,
        },
      ];

      const { payload, options } = slicePayload(before, after, evidenceRows);
      await drizzle.transaction(async (tx) => {
        await persistProjectRows(tx, payload, options);
      });

      const persisted = await loadProjectSlice(drizzle, fixture.projectId);
      expect(persisted.requirements[0]?.status).toBe("passed");
      expect(
        persisted.findings.find((item) => item.id === fixture.findingOneId)
          ?.status,
      ).toBe("dismissed");
      expect(
        persisted.remediations.find(
          (item) => item.id === fixture.remediationOneId,
        )?.status,
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

      const { payload, options } = slicePayload(
        before,
        structuredClone(before),
      );
      await drizzle.transaction(async (tx) => {
        await persistProjectRows(tx, payload, options);
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
        runLockedSliceWrite(drizzle, fixture, (slice, ids) =>
          dismissFinding(slice, ids.findingOneId, ids.remediationOneId),
        ),
        runLockedSliceWrite(drizzle, fixture, (slice, ids) =>
          dismissFinding(slice, ids.findingTwoId, ids.remediationTwoId),
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
        finalSlice.remediations.find(
          (item) => item.id === fixture.remediationOneId,
        )?.status,
      ).toBe("approved");
      expect(
        finalSlice.remediations.find(
          (item) => item.id === fixture.remediationTwoId,
        )?.status,
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

  it("persists worker-shape in-place mutations after the job-start snapshot (P0-1)", async () => {
    const drizzle = await getDrizzle();
    const suffix = `${Date.now()}-inplace`;
    const fixture = await insertProjectSliceFixture(drizzle, suffix);

    try {
      // Worker shape: load once, snapshot the slice, then runAssessment mutates
      // the SAME loaded objects in place before apply.
      const live = await loadProjectSlice(drizzle, fixture.projectId);
      const loadedSlice = snapshotProjectSlice(
        live.requirements,
        live.findings,
        live.remediations,
        live.alerts,
        fixture.projectId,
      );

      const requirement = live.requirements[0]!;
      requirement.status = "passed";
      requirement.updatedAt = "2026-02-01T00:00:00.000Z";
      const finding = live.findings.find(
        (item) => item.id === fixture.findingOneId,
      )!;
      finding.status = "resolved";

      const { payload, options } = slicePayload(loadedSlice, live);
      await drizzle.transaction(async (tx) => {
        await persistProjectRows(tx, payload, options);
      });

      const persisted = await loadProjectSlice(drizzle, fixture.projectId);
      expect(persisted.requirements[0]?.status).toBe("passed");
      expect(
        persisted.findings.find((item) => item.id === fixture.findingOneId)
          ?.status,
      ).toBe("resolved");
    } finally {
      await cleanupProjectSliceFixture(drizzle, fixture);
    }
  });

  it("collapses interleaved fresh-id creates for the same control into one row (P1-1)", async () => {
    const drizzle = await getDrizzle();
    const suffix = `${Date.now()}-dup`;
    const fixture = await insertProjectSliceFixture(drizzle, suffix);

    try {
      // Both writers loaded before any row existed for this control.
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

  it("does not let a stale worker apply revert a concurrent finding dismissal (P0-1)", async () => {
    const drizzle = await getDrizzle();
    const suffix = `${Date.now()}-finding-stale`;
    const fixture = await insertProjectSliceFixture(drizzle, suffix);

    try {
      // This is the slice the worker captured before scanning (job start).
      const loadedSlice = await loadProjectSlice(drizzle, fixture.projectId);

      // A human dismisses finding #2 while the worker is scanning, bumping
      // updatedAt strictly after the worker's recorded timestamp.
      // (Direct repo bump — the product path is withTargetedProjectWrite.)
      const humanNow = new Date(Date.now() + 1000).toISOString();
      await drizzle.transaction(async (tx) => {
        await upsertFindings(
          tx,
          [
            {
              ...loadedSlice.findings.find(
                (item) => item.id === fixture.findingTwoId,
              )!,
              status: "dismissed",
              updatedAt: humanNow,
            },
          ],
          { loadedUpdatedAtById: updatedAtById(loadedSlice.findings) },
        );
      });

      // The worker's assessment re-detects the violation at a shifted location and
      // applies its stale slice. The location change makes it a real diff entry —
      // the stale guard must still skip it because the human dismissed the
      // finding (newer updatedAt) after the worker loaded its slice.
      const workerAfter = structuredClone(loadedSlice);
      const reappeared = workerAfter.findings.find(
        (item) => item.id === fixture.findingTwoId,
      )!;
      reappeared.status = "open";
      reappeared.location = {
        kind: "source",
        filePath: "App.tsx",
        line: 9,
        column: 1,
        snippet: '<img src="x" alt="" />',
        span: { start: 100, end: 120 },
      };

      const { payload, options } = slicePayload(loadedSlice, workerAfter);
      await drizzle.transaction(async (tx) => {
        await persistProjectRows(tx, payload, options);
      });

      const persisted = await loadProjectSlice(drizzle, fixture.projectId);
      expect(
        persisted.findings.find((item) => item.id === fixture.findingTwoId)
          ?.status,
      ).toBe("dismissed");
    } finally {
      await cleanupProjectSliceFixture(drizzle, fixture);
    }
  });

  it("does not let a stale worker apply revert a concurrent remediation approval (P0-1)", async () => {
    const drizzle = await getDrizzle();
    const suffix = `${Date.now()}-remediation-stale`;
    const fixture = await insertProjectSliceFixture(drizzle, suffix);

    try {
      const loadedSlice = await loadProjectSlice(drizzle, fixture.projectId);

      // Human approves remediation #2 while the worker scans.
      const humanNow = new Date(Date.now() + 1000).toISOString();
      await drizzle.transaction(async (tx) => {
        await upsertRemediations(
          tx,
          [
            {
              ...loadedSlice.remediations.find(
                (item) => item.id === fixture.remediationTwoId,
              )!,
              status: "approved",
              updatedAt: humanNow,
            },
          ],
          { loadedUpdatedAtById: updatedAtById(loadedSlice.remediations) },
        );
      });

      // Worker's stale apply re-derives the remediation to "detected".
      const workerAfter = structuredClone(loadedSlice);
      workerAfter.remediations.find(
        (item) => item.id === fixture.remediationTwoId,
      )!.status = "detected";

      const { payload, options } = slicePayload(loadedSlice, workerAfter);
      await drizzle.transaction(async (tx) => {
        await persistProjectRows(tx, payload, options);
      });

      const persisted = await loadProjectSlice(drizzle, fixture.projectId);
      expect(
        persisted.remediations.find(
          (item) => item.id === fixture.remediationTwoId,
        )?.status,
      ).toBe("approved");
    } finally {
      await cleanupProjectSliceFixture(drizzle, fixture);
    }
  });
});

async function runLockedSliceWrite(
  drizzle: Awaited<ReturnType<typeof getDrizzle>>,
  fixture: ProjectSliceFixture,
  mutate: (
    slice: Awaited<ReturnType<typeof loadProjectSlice>>,
    fixture: ProjectSliceFixture,
  ) => Awaited<ReturnType<typeof loadProjectSlice>>,
): Promise<void> {
  await drizzle.transaction(async (tx) => {
    await acquireNamedPostgresAdvisoryLock(
      tx,
      projectWriteLockKey(fixture.projectId),
    );
    const before = await loadProjectSlice(tx, fixture.projectId);
    const after = mutate(structuredClone(before), fixture);
    const { payload, options } = slicePayload(before, after);
    await persistProjectRows(tx, payload, options);
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
      finding.id === findingId
        ? { ...finding, status: "dismissed" as const }
        : finding,
    ),
    remediations: slice.remediations.map((remediation) =>
      remediation.id === remediationId
        ? { ...remediation, status: "approved" as const }
        : remediation,
    ),
  };
}
