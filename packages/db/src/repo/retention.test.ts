import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { closeDrizzle, getDrizzle } from "../postgres";
import { prunePipelineRetention } from "./retention";

/** Opt-in: needs a migrated Postgres (`DATABASE_URL`). Run via `npm run test:db`. */
const enabled = Boolean(process.env.DATABASE_URL?.trim());

/**
 * Pipeline retention: assessments keep the newest N **per project** (never
 * globally), and an assessment still referenced by a finding is never deleted
 * (the finding would cascade away with it).
 */
describe.skipIf(!enabled)("pipeline retention", () => {
  afterAll(async () => {
    await closeDrizzle();
  });

  it("keeps the newest N per project and protects findings", async () => {
    const drizzle = await getDrizzle();
    const suffix = `${Date.now()}-retain`;
    const orgId = `org-${suffix}`;
    const projectId = `proj-${suffix}`;
    const decoyProjectId = `proj-decoy-${suffix}`;
    const userId = `user-${suffix}`;

    await drizzle.execute(sql`
      INSERT INTO organizations (id, slug, payload)
      VALUES (${orgId}, ${`slug-${suffix}`}, '{}'::jsonb)
    `);
    for (const [id, name] of [
      [projectId, "retention-fixture"],
      [decoyProjectId, "retention-decoy"],
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
    ) => {
      await drizzle.execute(sql`
        INSERT INTO assessments (id, project_id, started_at, completed_at, payload)
        VALUES (${id}, ${project}, ${completedAt}, ${completedAt}, '{}'::jsonb)
      `);
    };

    const assessments = [1, 2, 3, 4].map((index) => `a${index}-${suffix}`);
    for (const [position, id] of assessments.entries()) {
      const day = String(position + 1).padStart(2, "0");
      await insertAssessment(projectId, id, `2026-01-${day}T00:10:00.000Z`);
    }

    // A busier project with newer runs. A global ranking would push this
    // project's rows past position N and delete its newest assessments.
    for (let index = 0; index < 35; index += 1) {
      await insertAssessment(
        decoyProjectId,
        `b${index}-${suffix}`,
        `2026-02-01T00:${String(index).padStart(2, "0")}:00.000Z`,
      );
    }

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

    try {
      const result = await prunePipelineRetention(drizzle, {
        assessmentsPerProject: 2,
        abandonedAssessmentDays: 30,
        batchSize: 10,
        maxBatches: 5,
        // The decoy project is out of scope on purpose: the pass must rank per
        // project, so a busier project's newer runs never evict this one's.
        projectIds: [projectId],
      });

      // a4 + a3 survive as the newest two; a1 is pinned by the finding; only
      // a2 is actually deleted.
      expect(result.assessmentsDeleted).toBe(1);

      const remaining = (await drizzle.execute(sql`
        SELECT id FROM assessments WHERE project_id = ${projectId} ORDER BY id
      `)) as Array<{ id: string }>;
      expect(remaining.map((row) => row.id)).toEqual([
        assessments[0],
        assessments[2],
        assessments[3],
      ]);

      const decoyRows = (await drizzle.execute(sql`
        SELECT count(*)::int AS n FROM assessments WHERE project_id = ${decoyProjectId}
      `)) as Array<{ n: number }>;
      expect(decoyRows[0]?.n).toBe(35);
    } finally {
      await drizzle.execute(
        sql`DELETE FROM findings WHERE project_id = ${projectId}`,
      );
      for (const project of [projectId, decoyProjectId]) {
        await drizzle.execute(
          sql`DELETE FROM assessments WHERE project_id = ${project}`,
        );
        await drizzle.execute(sql`DELETE FROM projects WHERE id = ${project}`);
      }
      await drizzle.execute(sql`DELETE FROM organizations WHERE id = ${orgId}`);
    }
  });
});
