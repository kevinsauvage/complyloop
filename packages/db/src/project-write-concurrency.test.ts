import { afterAll, describe, expect, it } from "vitest";
import { eq, inArray, sql } from "drizzle-orm";
import type { Finding, Remediation } from "@complyloop/analysis-core/contract/finding-types";
import type { Requirement } from "@complyloop/domain/project-types";
import { closeDrizzle, getDrizzle, type DrizzleDb } from "./client";
import {
  persistProjectSliceDiff,
  snapshotProjectSlice,
  type ProjectSlice,
} from "./repo/apply";
import { upsertFindings } from "./repo/findings";
import { upsertRemediations } from "./repo/remediations";
import { upsertRequirements } from "./repo/requirements";
import { alerts, findings, remediations, requirements } from "./schema";
import {
  acquireNamedPostgresAdvisoryLock,
  projectWriteLockKey,
} from "./write-lock";

/** Opt-in: needs a migrated Postgres (`DATABASE_URL`). Skipped in the default CI quality job. */
const enabled = Boolean(process.env.DATABASE_URL?.trim());

/**
 * Regression tests for P0-2: project writes must serialize per project and
 * must not silently overwrite requirement rows that changed after load.
 */
describe.skipIf(!enabled)("project write concurrency", () => {
  afterAll(async () => {
    await closeDrizzle();
  });

  it("serializes concurrent slice writes so both finding updates persist", async () => {
    const drizzle = await getDrizzle();
    const suffix = `${Date.now()}`;
    const fixture = await insertProjectWriteFixture(drizzle, suffix);

    try {
      await Promise.all([
        runLockedProjectSliceWrite(drizzle, fixture.projectId, (slice) =>
          dismissFinding(slice, fixture.findingOneId, fixture.remediationOneId),
        ),
        runLockedProjectSliceWrite(drizzle, fixture.projectId, (slice) =>
          dismissFinding(slice, fixture.findingTwoId, fixture.remediationTwoId),
        ),
      ]);

      const finalSlice = await loadProjectSlice(drizzle, fixture.projectId);
      const findingOne = finalSlice.findings.find(
        (finding) => finding.id === fixture.findingOneId,
      );
      const findingTwo = finalSlice.findings.find(
        (finding) => finding.id === fixture.findingTwoId,
      );
      const remediationOne = finalSlice.remediations.find(
        (remediation) => remediation.id === fixture.remediationOneId,
      );
      const remediationTwo = finalSlice.remediations.find(
        (remediation) => remediation.id === fixture.remediationTwoId,
      );

      expect(findingOne?.status).toBe("dismissed");
      expect(findingTwo?.status).toBe("dismissed");
      expect(remediationOne?.status).toBe("approved");
      expect(remediationTwo?.status).toBe("approved");
    } finally {
      await cleanupProjectWriteFixture(drizzle, fixture);
    }
  });

  it("skips requirement upserts when the DB row is newer than the loaded snapshot", async () => {
    const drizzle = await getDrizzle();
    const suffix = `${Date.now()}`;
    const fixture = await insertProjectWriteFixture(drizzle, suffix);

    try {
      const loadedAt = "2026-01-01T00:00:00.000Z";
      const newerAt = "2026-01-02T00:00:00.000Z";
      const requirement: Requirement = {
        id: fixture.requirementId,
        projectId: fixture.projectId,
        controlId: fixture.controlId,
        status: "failed",
        determination: "automated",
        updatedAt: loadedAt,
      };

      await upsertRequirements(drizzle, [requirement]);
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
      await cleanupProjectWriteFixture(drizzle, fixture);
    }
  });
});

interface ProjectWriteFixture {
  orgId: string;
  frameworkId: string;
  controlId: string;
  projectId: string;
  findingOneId: string;
  findingTwoId: string;
  remediationOneId: string;
  remediationTwoId: string;
  requirementId: string;
}

async function insertProjectWriteFixture(
  drizzle: DrizzleDb,
  suffix: string,
): Promise<ProjectWriteFixture> {
  const orgId = `org-write-${suffix}`;
  const frameworkId = `fw-write-${suffix}`;
  const controlId = `ctrl-write-${suffix}`;
  const projectId = `proj-write-${suffix}`;
  const findingOneId = `finding-one-${suffix}`;
  const findingTwoId = `finding-two-${suffix}`;
  const remediationOneId = `rem-one-${suffix}`;
  const remediationTwoId = `rem-two-${suffix}`;
  const requirementId = `req-write-${suffix}`;

  await drizzle.execute(sql`
    INSERT INTO frameworks (id, payload) VALUES (${frameworkId}, '{}'::jsonb)
  `);
  await drizzle.execute(sql`
    INSERT INTO controls (id, framework_id, payload)
    VALUES (${controlId}, ${frameworkId}, '{}'::jsonb)
  `);
  await drizzle.execute(sql`
    INSERT INTO organizations (id, slug, payload)
    VALUES (${orgId}, ${`slug-write-${suffix}`}, '{}'::jsonb)
  `);
  await drizzle.execute(sql`
    INSERT INTO projects (id, name, org_id, payload)
    VALUES (${projectId}, 'write-fixture', ${orgId}, '{}'::jsonb)
  `);

  const baseFinding = {
    projectId,
    controlId,
    assessmentId: `assessment-${suffix}`,
    checkId: "img-alt",
    kind: "violation" as const,
    status: "open" as const,
    severity: "serious" as const,
    confidence: "high" as const,
    reason: "Missing alt",
    location: {
      kind: "source" as const,
      filePath: "App.tsx",
      line: 1,
      column: 1,
      snippet: '<img src="x" />',
      span: { start: 0, end: 16 },
    },
    fix: null,
    explanations: [],
    detectedAt: "2026-01-01T00:00:00.000Z",
  };

  const findingOne: Finding = { ...baseFinding, id: findingOneId };
  const findingTwo: Finding = { ...baseFinding, id: findingTwoId };
  const remediationOne: Remediation = {
    id: remediationOneId,
    findingId: findingOneId,
    status: "suggested",
    suggestion: {
      description: "Add alt",
      proposedSnippet: '<img src="x" alt="" />',
      provenance: "deterministic",
    },
    history: [],
  };
  const remediationTwo: Remediation = {
    id: remediationTwoId,
    findingId: findingTwoId,
    status: "suggested",
    suggestion: {
      description: "Add alt",
      proposedSnippet: '<img src="x" alt="" />',
      provenance: "deterministic",
    },
    history: [],
  };

  await upsertFindings(drizzle, [findingOne, findingTwo]);
  await upsertRemediations(drizzle, [remediationOne, remediationTwo]);
  await upsertRequirements(drizzle, [
    {
      id: requirementId,
      projectId,
      controlId,
      status: "failed",
      determination: "automated",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  ]);

  return {
    orgId,
    frameworkId,
    controlId,
    projectId,
    findingOneId,
    findingTwoId,
    remediationOneId,
    remediationTwoId,
    requirementId,
  };
}

async function cleanupProjectWriteFixture(
  drizzle: DrizzleDb,
  fixture: ProjectWriteFixture,
): Promise<void> {
  await drizzle.execute(sql`DELETE FROM projects WHERE id = ${fixture.projectId}`);
  await drizzle.execute(sql`DELETE FROM organizations WHERE id = ${fixture.orgId}`);
  await drizzle.execute(sql`DELETE FROM controls WHERE id = ${fixture.controlId}`);
  await drizzle.execute(sql`
    DELETE FROM frameworks WHERE id = ${fixture.frameworkId}
  `);
}

async function loadProjectSlice(
  drizzle: DrizzleDb,
  projectId: string,
): Promise<ProjectSlice> {
  const [requirementRows, findingRows, alertRows] = await Promise.all([
    drizzle
      .select()
      .from(requirements)
      .where(eq(requirements.projectId, projectId)),
    drizzle.select().from(findings).where(eq(findings.projectId, projectId)),
    drizzle.select().from(alerts).where(eq(alerts.projectId, projectId)),
  ]);
  const findingIds = findingRows.map((row) => row.id);
  const remediationRows =
    findingIds.length === 0
      ? []
      : await drizzle
          .select()
          .from(remediations)
          .where(inArray(remediations.findingId, findingIds));

  return snapshotProjectSlice(
    requirementRows.map((row) => row.payload),
    findingRows.map((row) => row.payload),
    remediationRows.map((row) => row.payload),
    alertRows.map((row) => row.payload),
    projectId,
  );
}

async function runLockedProjectSliceWrite(
  drizzle: DrizzleDb,
  projectId: string,
  mutate: (slice: ProjectSlice) => ProjectSlice,
): Promise<void> {
  await drizzle.transaction(async (tx) => {
    await acquireNamedPostgresAdvisoryLock(tx, projectWriteLockKey(projectId));
    const before = await loadProjectSlice(tx, projectId);
    const after = mutate(structuredClone(before));
    await persistProjectSliceDiff(tx, before, after, []);
  });
}

function dismissFinding(
  slice: ProjectSlice,
  findingId: string,
  remediationId: string,
): ProjectSlice {
  return {
    ...slice,
    findings: slice.findings.map((finding) =>
      finding.id === findingId ? { ...finding, status: "dismissed" } : finding,
    ),
    remediations: slice.remediations.map((remediation) =>
      remediation.id === remediationId
        ? { ...remediation, status: "approved" }
        : remediation,
    ),
  };
}
