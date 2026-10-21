import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { closeDrizzle, getDrizzle } from "../postgres";
import { prunePipelineRetention } from "./retention";

/** Opt-in: needs a migrated Postgres (`DATABASE_URL`). Run via `npm run test:db`. */
const enabled = Boolean(process.env.DATABASE_URL?.trim());

/**
 * Pipeline retention: terminal jobs age out, assessments keep the newest N
 * **per project** (never globally), snapshots follow their assessment by FK
 * cascade, and an assessment still referenced by a finding is never deleted
 * (the finding would cascade away with it).
 */
describe.skipIf(!enabled)("pipeline retention", () => {
  afterAll(async () => {
    await closeDrizzle();
  });

  it("keeps the newest N per project and protects findings and the last full hash map", async () => {
    const drizzle = await getDrizzle();
    const suffix = `${Date.now()}-retain`;
    const orgId = `org-${suffix}`;
    const projectId = `proj-${suffix}`;
    const decoyProjectId = `proj-decoy-${suffix}`;
    const hashProjectId = `proj-hash-${suffix}`;
    const userId = `user-${suffix}`;

    await drizzle.execute(sql`
      INSERT INTO organizations (id, slug, payload)
      VALUES (${orgId}, ${`slug-${suffix}`}, '{}'::jsonb)
    `);
    for (const [id, name] of [
      [projectId, "retention-fixture"],
      [decoyProjectId, "retention-decoy"],
      [hashProjectId, "retention-hash"],
    ] as const) {
      await drizzle.execute(sql`
        INSERT INTO projects (id, name, owner_user_id, org_id, payload)
        VALUES (${id}, ${name}, ${userId}, ${orgId}, '{}'::jsonb)
      `);
    }

    const insertAssessment = async (
      project: string,
      id: string,
      completedAt: string,
      fullHashMap: boolean,
    ) => {
      await drizzle.execute(sql`
        INSERT INTO assessments (id, project_id, started_at, completed_at, payload)
        VALUES (${id}, ${project}, ${completedAt}, ${completedAt}, '{}'::jsonb)
      `);
      await drizzle.execute(sql`
        INSERT INTO assessment_snapshots (assessment_id, snapshot, hashes_unchanged)
        VALUES (
          ${id},
          ${JSON.stringify(
            fullHashMap
              ? { fileHashes: { "App.tsx": "abc" }, scope: "repo" }
              : { fileHashes: {}, scope: "repo" },
          )}::jsonb,
          ${!fullHashMap}
        )
      `);
    };

    const assessments = [1, 2, 3, 4].map((index) => `a${index}-${suffix}`);
    for (const [position, id] of assessments.entries()) {
      const day = String(position + 1).padStart(2, "0");
      await insertAssessment(
        projectId,
        id,
        `2026-01-${day}T00:10:00.000Z`,
        true,
      );
    }

    // A busier project with newer runs. A global ranking would push this
    // project's rows past position N and delete its newest assessments.
    for (let index = 0; index < 35; index += 1) {
      await insertAssessment(
        decoyProjectId,
        `b${index}-${suffix}`,
        `2026-02-01T00:${String(index).padStart(2, "0")}:00.000Z`,
        true,
      );
    }

    // Long-stable project: the only full hash map is the oldest run, followed
    // by unchanged-tree markers. `getLatestAssessmentSnapshot` falls back to
    // that full map, so it must survive even when it falls out of the newest N.
    await insertAssessment(
      hashProjectId,
      `c1-${suffix}`,
      "2026-03-01T00:00:00.000Z",
      true,
    );
    await insertAssessment(
      hashProjectId,
      `c2-${suffix}`,
      "2026-03-02T00:00:00.000Z",
      false,
    );
    await insertAssessment(
      hashProjectId,
      `c3-${suffix}`,
      "2026-03-03T00:00:00.000Z",
      false,
    );

    // A finding pins the oldest assessment of the fixture project: deleting it
    // would cascade the finding (and its remediation workflow) away.
    await drizzle.execute(sql`
      INSERT INTO findings (
        id, project_id, control_id, assessment_id, status, kind, engine,
        severity_rank, payload
      ) VALUES (
        ${`f-${suffix}`}, ${projectId}, 'ctl-img-alt', ${assessments[0]}, 'open',
        'violation', 'ast', 0, '{}'::jsonb
      )
    `);

    const insertJob = async (id: string, status: string, ageDays: number) => {
      await drizzle.execute(sql`
        INSERT INTO assessment_jobs (
          id, project_id, status, trigger, payload, available_at,
          created_at, updated_at
        ) VALUES (
          ${id}, ${projectId}, ${status}, 'manual', '{}'::jsonb,
          now() - (${ageDays} * interval '1 day'),
          now() - (${ageDays} * interval '1 day'),
          now() - (${ageDays} * interval '1 day')
        )
      `);
    };
    await insertJob(`j-old-${suffix}`, "succeeded", 40);
    await insertJob(`j-queued-${suffix}`, "queued", 40);
    await insertJob(`j-fresh-${suffix}`, "succeeded", 1);

    try {
      const result = await prunePipelineRetention(drizzle, {
        jobRetentionDays: 30,
        assessmentsPerProject: 2,
        abandonedAssessmentDays: 30,
        batchSize: 10,
        maxBatches: 5,
        projectIds: [projectId, hashProjectId],
      });

      // a4 + a3 survive as the newest two; a1 is pinned by the finding; only
      // a2 is actually deleted. The hash project keeps all three (position 3
      // is the last full hash map).
      expect(result.assessmentsDeleted).toBe(1);
      expect(result.jobsDeleted).toBe(1);

      const remaining = (await drizzle.execute(sql`
        SELECT id FROM assessments WHERE project_id = ${projectId} ORDER BY id
      `)) as Array<{ id: string }>;
      expect(remaining.map((row) => row.id)).toEqual([
        assessments[0],
        assessments[2],
        assessments[3],
      ]);

      const hashRows = (await drizzle.execute(sql`
        SELECT id FROM assessments WHERE project_id = ${hashProjectId} ORDER BY id
      `)) as Array<{ id: string }>;
      expect(hashRows.map((row) => row.id)).toEqual([
        `c1-${suffix}`,
        `c2-${suffix}`,
        `c3-${suffix}`,
      ]);

      const fullMap = (await drizzle.execute(sql`
        SELECT snapshot FROM assessment_snapshots
        WHERE assessment_id = ${`c1-${suffix}`}
      `)) as Array<{ snapshot: { fileHashes: Record<string, string> } }>;
      expect(fullMap[0]?.snapshot.fileHashes).toEqual({ "App.tsx": "abc" });

      const snapshots = (await drizzle.execute(sql`
        SELECT s.assessment_id
        FROM assessment_snapshots s
        JOIN assessments a ON a.id = s.assessment_id
        WHERE a.project_id = ${projectId}
        ORDER BY s.assessment_id
      `)) as Array<{ assessment_id: string }>;
      expect(snapshots.map((row) => row.assessment_id)).not.toContain(
        assessments[1],
      );
      expect(snapshots.map((row) => row.assessment_id)).toContain(
        assessments[0],
      );

      const jobs = (await drizzle.execute(sql`
        SELECT id FROM assessment_jobs WHERE project_id = ${projectId} ORDER BY id
      `)) as Array<{ id: string }>;
      // Queued work is never aged out, and a fresh terminal job stays.
      expect(jobs.map((row) => row.id)).toEqual([
        `j-fresh-${suffix}`,
        `j-queued-${suffix}`,
      ]);
    } finally {
      await drizzle.execute(
        sql`DELETE FROM assessment_jobs WHERE project_id = ${projectId}`,
      );
      await drizzle.execute(
        sql`DELETE FROM findings WHERE project_id = ${projectId}`,
      );
      for (const project of [projectId, decoyProjectId, hashProjectId]) {
        await drizzle.execute(
          sql`DELETE FROM assessments WHERE project_id = ${project}`,
        );
        await drizzle.execute(sql`DELETE FROM projects WHERE id = ${project}`);
      }
      await drizzle.execute(sql`DELETE FROM organizations WHERE id = ${orgId}`);
    }
  });
});
