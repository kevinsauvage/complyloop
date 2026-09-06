import { eq, inArray, sql } from "drizzle-orm";
import type { Alert, Finding, Remediation } from "../types";
import type { Requirement } from "@complyloop/analysis-core/contract/project-types";
import type { DrizzleDb } from "../client.ts";
import {
  snapshotProjectSlice,
  type ProjectSlice,
} from "../repo/apply.ts";
import { upsertFindings } from "../repo/findings.ts";
import { upsertRemediations } from "../repo/remediations.ts";
import { upsertRequirements } from "../repo/requirements.ts";
import { upsertAlerts } from "../repo/alerts.ts";
import { insertAssessment } from "../repo/assessments.ts";
import { alerts, findings, remediations, requirements } from "../schema.ts";

export interface ProjectSliceFixture {
  orgId: string;
  frameworkId: string;
  controlId: string;
  projectId: string;
  requirementId: string;
  findingOneId: string;
  findingTwoId: string;
  remediationOneId: string;
  remediationTwoId: string;
  alertId: string;
  userId: string;
  githubLogin: string;
}

export async function insertProjectSliceFixture(
  drizzle: DrizzleDb,
  suffix: string,
): Promise<ProjectSliceFixture> {
  const orgId = `org-slice-${suffix}`;
  const frameworkId = `fw-slice-${suffix}`;
  const controlId = `ctrl-slice-${suffix}`;
  const projectId = `proj-slice-${suffix}`;
  const findingOneId = `finding-one-${suffix}`;
  const findingTwoId = `finding-two-${suffix}`;
  const remediationOneId = `rem-one-${suffix}`;
  const remediationTwoId = `rem-two-${suffix}`;
  const requirementId = `req-slice-${suffix}`;
  const alertId = `alert-slice-${suffix}`;
  const userId = `user-slice-${suffix}`;
  const githubLogin = `login-slice-${suffix}`;

  await drizzle.execute(sql`
    INSERT INTO frameworks (id, payload) VALUES (${frameworkId}, '{}'::jsonb)
  `);
  await drizzle.execute(sql`
    INSERT INTO controls (id, framework_id, payload)
    VALUES (${controlId}, ${frameworkId}, '{}'::jsonb)
  `);
  await drizzle.execute(sql`
    INSERT INTO organizations (id, slug, payload)
    VALUES (${orgId}, ${`slug-slice-${suffix}`}, '{}'::jsonb)
  `);
  await drizzle.execute(sql`
    INSERT INTO memberships (id, org_id, user_id, github_login, role, payload)
    VALUES (
      ${`mem-slice-${suffix}`},
      ${orgId},
      ${userId},
      ${githubLogin},
      'owner',
      '{}'::jsonb
    )
  `);
  await drizzle.execute(sql`
    INSERT INTO projects (id, name, owner_user_id, org_id, payload)
    VALUES (
      ${projectId},
      'slice-fixture',
      ${userId},
      ${orgId},
      ${JSON.stringify({
        id: projectId,
        name: "slice-fixture",
        source: "github",
        orgId,
        ownerUserId: userId,
        createdAt: "2026-01-01T00:00:00.000Z",
        github: { fullName: `acme/slice-${suffix}` },
      })}::jsonb
    )
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
  const requirement: Requirement = {
    id: requirementId,
    projectId,
    controlId,
    status: "failed",
    determination: "automated",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
  const alert: Alert = {
    id: alertId,
    projectId,
    kind: "compliance_regression",
    summary: "regression",
    at: "2026-01-01T00:00:00.000Z",
    read: false,
    detail: { controlId },
  };

  await insertAssessment(
    drizzle,
    {
      id: `assessment-${suffix}`,
      projectId,
      startedAt: "2026-01-01T00:00:00.000Z",
      completedAt: "2026-01-01T00:00:00.000Z",
      filesScanned: 1,
      summary: {
        passed: 0,
        failed: 1,
        needs_review: 0,
        not_applicable: 0,
        unable_to_verify: 0,
      },
    },
    { fileHashes: {} },
  );
  await upsertFindings(drizzle, [findingOne, findingTwo]);
  await upsertRemediations(drizzle, [remediationOne, remediationTwo]);
  await upsertRequirements(drizzle, [requirement]);
  await upsertAlerts(drizzle, [alert]);

  return {
    orgId,
    frameworkId,
    controlId,
    projectId,
    requirementId,
    findingOneId,
    findingTwoId,
    remediationOneId,
    remediationTwoId,
    alertId,
    userId,
    githubLogin,
  };
}

export async function cleanupProjectSliceFixture(
  drizzle: DrizzleDb,
  fixture: ProjectSliceFixture,
): Promise<void> {
  await drizzle.execute(sql`DELETE FROM projects WHERE id = ${fixture.projectId}`);
  await drizzle.execute(sql`DELETE FROM memberships WHERE org_id = ${fixture.orgId}`);
  await drizzle.execute(sql`DELETE FROM organizations WHERE id = ${fixture.orgId}`);
  await drizzle.execute(sql`DELETE FROM controls WHERE id = ${fixture.controlId}`);
  await drizzle.execute(sql`
    DELETE FROM frameworks WHERE id = ${fixture.frameworkId}
  `);
}

export async function loadProjectSlice(
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

export function sliceFingerprint(slice: ProjectSlice): string {
  return JSON.stringify(slice);
}
