#!/usr/bin/env tsx
/**
 * Resets Postgres and seeds the Playwright e2e fixture project.
 * Usage: npm run e2e:seed
 */
import { shippedCatalog } from "@complyloop/analysis-core/catalog/catalog";
import { insertAssessment } from "@complyloop/db/repo/assessments";
import { upsertFindings } from "@complyloop/db/repo/findings";
import { insertMembership, insertOrganization } from "@complyloop/db/repo/orgs";
import { insertProject } from "@complyloop/db/repo/projects";
import { upsertRemediations } from "@complyloop/db/repo/remediations";

import {
  E2E_ORG_ID,
  E2E_OWNER,
  E2E_PROJECT_FULL_NAME,
  E2E_PROJECT_ID,
  E2E_VIEWER,
} from "../e2e/constants";
import { storeUserGitHubToken } from "../src/server/github/github-tokens";
import { getDrizzle, openScriptClient, requireDatabaseUrl } from "./db";

async function truncateAll(connectionString: string): Promise<void> {
  const sql = await openScriptClient(connectionString, 1);
  try {
    await sql.unsafe(`
      TRUNCATE TABLE
        evidence,
        alerts,
        remediations,
        findings,
        assessment_snapshots,
        assessments,
        requirements,
        projects,
        memberships,
        organizations,
        github_tokens,
        webhook_deliveries
      RESTART IDENTITY CASCADE;
    `);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function main(): Promise<void> {
  const url = requireDatabaseUrl("DATABASE_URL is required for e2e:seed.");

  await truncateAll(url);

  const now = new Date().toISOString();
  const drizzle = await getDrizzle();
  const { controls } = shippedCatalog();
  const control =
    controls.find((candidate) => candidate.checkId === "img-alt") ??
    controls[0];
  if (!control) {
    throw new Error("Shipped catalog has no controls.");
  }

  const findingId = "e2e-finding-img-alt";
  const assessmentId = "e2e-assessment-seed";

  await drizzle.transaction(async (tx) => {
    await insertOrganization(tx, {
      id: E2E_ORG_ID,
      name: "E2E Workspace",
      slug: "e2e-workspace",
      createdAt: now,
    });
    await insertMembership(tx, {
      id: "e2e-membership-owner",
      orgId: E2E_ORG_ID,
      role: "owner",
      userId: E2E_OWNER.id,
      githubLogin: E2E_OWNER.login,
      createdAt: now,
    });
    await insertMembership(tx, {
      id: "e2e-membership-viewer",
      orgId: E2E_ORG_ID,
      role: "viewer",
      userId: E2E_VIEWER.id,
      githubLogin: E2E_VIEWER.login,
      createdAt: now,
    });
    await insertProject(tx, {
      id: E2E_PROJECT_ID,
      name: "sample-app",
      source: "github",
      sourceRef: `https://github.com/${E2E_PROJECT_FULL_NAME}`,
      createdAt: now,
      orgId: E2E_ORG_ID,
      ownerUserId: E2E_OWNER.id,
      github: {
        fullName: E2E_PROJECT_FULL_NAME,
        defaultBranch: "main",
        private: false,
      },
    });

    await insertAssessment(
      tx,
      {
        id: assessmentId,
        projectId: E2E_PROJECT_ID,
        startedAt: now,
        completedAt: now,
        filesScanned: 1,
        scanMode: "full",
        engines: { ast: true, runtime: false },
        summary: {
          passed: 0,
          failed: 1,
          needs_review: 0,
          not_applicable: 0,
          unable_to_verify: 0,
        },
      },
      { fileHashes: { "Bad.tsx": "e2e-seed" } },
    );

    await upsertFindings(tx, [{
      id: findingId,
      projectId: E2E_PROJECT_ID,
      controlId: control.id,
      assessmentId,
      checkId: "img-alt",
      status: "open",
      kind: "violation",
      severity: "serious",
      confidence: "high",
      reason: "Image is missing an alt attribute.",
      location: {
        kind: "source",
        filePath: "Bad.tsx",
        line: 5,
        column: 7,
        snippet: '<img src="/x.png" />',
        span: { start: 0, end: 20 },
      },
      analyzerId: "ast",
      fix: {
        kind: "insert_attribute",
        attribute: "alt",
        value: "",
        editable: true,
        span: { start: 0, end: 20 },
      },
      explanations: [],
      detectedAt: now,
    }]);

    await upsertRemediations(tx, [{
      id: "e2e-remediation-img-alt",
      findingId,
      status: "suggested",
      suggestion: {
        description: "Add a meaningful alt attribute.",
        proposedSnippet: 'alt=""',
        provenance: "deterministic",
      },
      history: [
        { status: "detected", at: now },
        { status: "suggested", at: now },
      ],
    }]);
  });

  await storeUserGitHubToken(
    E2E_OWNER.id,
    process.env.E2E_GITHUB_TOKEN ?? "ghx_e2e_mock_check",
  );

  console.log(
    `E2E seed complete: org=${E2E_ORG_ID} project=${E2E_PROJECT_ID} owner=${E2E_OWNER.login}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
