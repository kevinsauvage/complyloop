import { afterAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { closeDrizzle, getDrizzle } from "./client";

/** Runs when Postgres is migrated (`DATABASE_URL`). Skipped in the default CI quality job. */
const enabled = Boolean(process.env.DATABASE_URL?.trim());

describe.skipIf(!enabled)("tenant database constraints", () => {
  afterAll(async () => {
    await closeDrizzle();
  });

  it("rejects invalid statuses and membership roles", async () => {
    const drizzle = await getDrizzle();
    const suffix = `${Date.now()}`;
    const ids = await insertFixtureGraph(drizzle, suffix);

    await expect(
      drizzle.execute(
        sql`UPDATE findings SET status = 'complete' WHERE id = ${ids.findingId}`,
      ),
    ).rejects.toThrow(/findings_status_check|violates check constraint/i);

    await expect(
      drizzle.execute(
        sql`UPDATE remediations SET status = 'done' WHERE id = ${ids.remediationId}`,
      ),
    ).rejects.toThrow(/remediations_status_check|violates check constraint/i);

    await expect(
      drizzle.execute(
        sql`UPDATE requirements SET status = 'ok' WHERE id = ${ids.requirementId}`,
      ),
    ).rejects.toThrow(/requirements_status_check|violates check constraint/i);

    await expect(
      drizzle.execute(
        sql`UPDATE memberships SET role = 'superadmin' WHERE id = ${ids.membershipId}`,
      ),
    ).rejects.toThrow(/memberships_role_check|violates check constraint/i);

    await cleanupFixtureGraph(drizzle, ids);
  });

  it("rejects orphan findings and duplicate org slugs", async () => {
    const drizzle = await getDrizzle();
    const suffix = `${Date.now()}-fk`;
    const ids = await insertFixtureGraph(drizzle, suffix);

    await expect(
      drizzle.execute(sql`
        INSERT INTO findings (id, project_id, control_id, assessment_id, status, payload)
        VALUES (
          ${`finding-orphan-${suffix}`},
          'missing-project',
          ${ids.controlId},
          ${ids.assessmentId},
          'open',
          '{}'::jsonb
        )
      `),
    ).rejects.toThrow(/foreign key|findings_project_id_fk/i);

    await expect(
      drizzle.execute(sql`
        INSERT INTO organizations (id, slug, payload)
        VALUES (
          ${`org-dup-${suffix}`},
          ${ids.orgSlug},
          '{}'::jsonb
        )
      `),
    ).rejects.toThrow(/organizations_slug_uidx|duplicate key/i);

    await expect(
      drizzle.execute(sql`
        INSERT INTO projects (id, name, owner_user_id, org_id, payload)
        VALUES (
          ${`proj-dup-${suffix}`},
          'dup',
          ${`other-${suffix}`},
          ${ids.orgId},
          ${JSON.stringify({ github: { fullName: `Acme/Fixture-${suffix}` } })}::jsonb
        )
      `),
    ).rejects.toThrow(/projects_org_github_uidx|duplicate key/i);

    await cleanupFixtureGraph(drizzle, ids);
  });

  it("allows evidence rows after the project is deleted", async () => {
    const drizzle = await getDrizzle();
    const suffix = `${Date.now()}-ev`;
    const ids = await insertFixtureGraph(drizzle, suffix);
    const evidenceId = `evidence-${suffix}`;

    await drizzle.execute(sql`
      INSERT INTO evidence (id, at, kind, summary, project_id)
      VALUES (${evidenceId}, NOW(), 'project_disconnected', 'kept', ${ids.projectId})
    `);

    await drizzle.execute(sql`DELETE FROM projects WHERE id = ${ids.projectId}`);

    const leftover = await drizzle.execute(sql`
      SELECT id FROM evidence WHERE id = ${evidenceId}
    `);
    expect(rowCount(leftover)).toBe(1);

    await drizzle.execute(
      sql`DELETE FROM memberships WHERE id = ${ids.membershipId}`,
    );
    await drizzle.execute(sql`DELETE FROM organizations WHERE id = ${ids.orgId}`);
    await drizzle.execute(sql`DELETE FROM controls WHERE id = ${ids.controlId}`);
    await drizzle.execute(
      sql`DELETE FROM frameworks WHERE id = ${ids.frameworkId}`,
    );
  });

  it("uses project-scoped indexes for findings, requirements, and evidence", async () => {
    const drizzle = await getDrizzle();
    const suffix = `${Date.now()}-idx`;
    const ids = await insertFixtureGraph(drizzle, suffix);

    await drizzle.execute(sql`
      INSERT INTO evidence (id, at, kind, summary, project_id)
      VALUES (${`evidence-idx-${suffix}`}, NOW(), 'assessment_completed', 'indexed', ${ids.projectId})
    `);

    await drizzle.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL enable_seqscan = off`);
      await expectIndexUsed(
        tx,
        sql`EXPLAIN SELECT id FROM findings WHERE project_id = ${ids.projectId} AND status = 'open'`,
        "findings_project_status_idx",
      );
      await expectIndexUsed(
        tx,
        sql`EXPLAIN SELECT id FROM findings WHERE project_id = ${ids.projectId} AND assessment_id = ${ids.assessmentId}`,
        "findings_project_assessment_idx",
      );
      await expectIndexUsed(
        tx,
        sql`EXPLAIN SELECT id FROM requirements WHERE project_id = ${ids.projectId} AND status = 'failed'`,
        "requirements_project_status_idx",
      );
      await expectIndexUsed(
        tx,
        sql`EXPLAIN SELECT id FROM evidence WHERE project_id = ${ids.projectId} ORDER BY at`,
        "evidence_project_at_idx",
      );
    });

    await cleanupFixtureGraph(drizzle, ids);
  });
});

type FixtureIds = {
  frameworkId: string;
  controlId: string;
  orgId: string;
  orgSlug: string;
  membershipId: string;
  projectId: string;
  requirementId: string;
  assessmentId: string;
  findingId: string;
  remediationId: string;
};

type Drizzle = Awaited<ReturnType<typeof getDrizzle>>;

async function insertFixtureGraph(
  drizzle: Drizzle,
  suffix: string,
): Promise<FixtureIds> {
  const ids: FixtureIds = {
    frameworkId: `fw-${suffix}`,
    controlId: `ctrl-${suffix}`,
    orgId: `org-${suffix}`,
    orgSlug: `slug-${suffix}`,
    membershipId: `mem-${suffix}`,
    projectId: `proj-${suffix}`,
    requirementId: `req-${suffix}`,
    assessmentId: `asmt-${suffix}`,
    findingId: `find-${suffix}`,
    remediationId: `rem-${suffix}`,
  };

  await drizzle.execute(sql`
    INSERT INTO frameworks (id, payload) VALUES (${ids.frameworkId}, '{}'::jsonb)
  `);
  await drizzle.execute(sql`
    INSERT INTO controls (id, framework_id, payload)
    VALUES (${ids.controlId}, ${ids.frameworkId}, '{}'::jsonb)
  `);
  await drizzle.execute(sql`
    INSERT INTO organizations (id, slug, payload)
    VALUES (${ids.orgId}, ${ids.orgSlug}, '{}'::jsonb)
  `);
  await drizzle.execute(sql`
    INSERT INTO memberships (id, org_id, user_id, github_login, role, payload)
    VALUES (${ids.membershipId}, ${ids.orgId}, ${`user-${suffix}`}, ${`login-${suffix}`}, 'owner', '{}'::jsonb)
  `);
  await drizzle.execute(sql`
    INSERT INTO projects (id, name, owner_user_id, org_id, payload)
    VALUES (
      ${ids.projectId},
      'fixture',
      ${`user-${suffix}`},
      ${ids.orgId},
      ${JSON.stringify({
        github: { fullName: `acme/fixture-${suffix}` },
      })}::jsonb
    )
  `);
  await drizzle.execute(sql`
    INSERT INTO requirements (id, project_id, control_id, status, payload)
    VALUES (${ids.requirementId}, ${ids.projectId}, ${ids.controlId}, 'failed', '{}'::jsonb)
  `);
  await drizzle.execute(sql`
    INSERT INTO assessments (id, project_id, payload)
    VALUES (${ids.assessmentId}, ${ids.projectId}, '{}'::jsonb)
  `);
  await drizzle.execute(sql`
    INSERT INTO findings (id, project_id, control_id, assessment_id, status, payload)
    VALUES (${ids.findingId}, ${ids.projectId}, ${ids.controlId}, ${ids.assessmentId}, 'open', '{}'::jsonb)
  `);
  await drizzle.execute(sql`
    INSERT INTO remediations (id, finding_id, status, payload)
    VALUES (${ids.remediationId}, ${ids.findingId}, 'suggested', '{}'::jsonb)
  `);

  return ids;
}

async function cleanupFixtureGraph(
  drizzle: Drizzle,
  ids: FixtureIds,
): Promise<void> {
  await drizzle.execute(sql`DELETE FROM remediations WHERE id = ${ids.remediationId}`);
  await drizzle.execute(sql`DELETE FROM findings WHERE id = ${ids.findingId}`);
  await drizzle.execute(sql`DELETE FROM requirements WHERE id = ${ids.requirementId}`);
  await drizzle.execute(sql`DELETE FROM assessments WHERE id = ${ids.assessmentId}`);
  await drizzle.execute(sql`DELETE FROM projects WHERE id = ${ids.projectId}`);
  await drizzle.execute(sql`DELETE FROM memberships WHERE id = ${ids.membershipId}`);
  await drizzle.execute(sql`DELETE FROM organizations WHERE id = ${ids.orgId}`);
  await drizzle.execute(sql`DELETE FROM controls WHERE id = ${ids.controlId}`);
  await drizzle.execute(sql`DELETE FROM frameworks WHERE id = ${ids.frameworkId}`);
}

function rowCount(result: unknown): number {
  if (Array.isArray(result)) return result.length;
  if (
    result &&
    typeof result === "object" &&
    "length" in result &&
    typeof result.length === "number"
  ) {
    return result.length;
  }
  return 0;
}

async function expectIndexUsed(
  tx: { execute: (query: ReturnType<typeof sql>) => Promise<unknown> },
  query: ReturnType<typeof sql>,
  indexName: string,
): Promise<void> {
  const plan = await tx.execute(query);
  expect(JSON.stringify(plan), `plan should use ${indexName}`).toMatch(
    new RegExp(indexName),
  );
}
