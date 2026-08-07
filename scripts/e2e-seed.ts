#!/usr/bin/env tsx
/**
 * Resets Postgres and seeds the Playwright e2e fixture project.
 * Usage: npm run e2e:seed
 */
import path from "node:path";
import { config as loadEnv } from "dotenv";
import {
  E2E_ORG_ID,
  E2E_OWNER,
  E2E_PROJECT_FULL_NAME,
  E2E_PROJECT_ID,
  E2E_VIEWER,
} from "../e2e/constants";
import { withDbWrite } from "../src/server/db";
import { createPostgresClient } from "../src/server/db-store/postgres-url";
import { ensureSeeded } from "../src/server/seed";

function loadLocalEnv(): void {
  // Do not override CI / Playwright-injected DATABASE_URL.
  if (process.env.DATABASE_URL?.trim()) return;
  loadEnv({ path: path.join(process.cwd(), ".env.local") });
  if (!process.env.DATABASE_URL?.trim()) {
    loadEnv({ path: path.join(process.cwd(), ".env") });
  }
}

async function truncateAll(connectionString: string): Promise<void> {
  const sql = await createPostgresClient(connectionString, { max: 1 });
  try {
    await sql.unsafe(`
      TRUNCATE TABLE
        evidence,
        alerts,
        remediations,
        findings,
        assessments,
        requirements,
        projects,
        memberships,
        organizations,
        controls,
        frameworks,
        app_meta,
        github_tokens,
        webhook_deliveries
      RESTART IDENTITY CASCADE;
    `);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function main(): Promise<void> {
  loadLocalEnv();
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    console.error("DATABASE_URL is required for e2e:seed.");
    process.exit(1);
  }

  await truncateAll(url);

  const now = new Date().toISOString();
  await withDbWrite((db) => {
    ensureSeeded(db);

    db.organizations.push({
      id: E2E_ORG_ID,
      name: "E2E Workspace",
      slug: "e2e-workspace",
      createdAt: now,
    });
    db.memberships.push(
      {
        id: "e2e-membership-owner",
        orgId: E2E_ORG_ID,
        role: "owner",
        userId: E2E_OWNER.id,
        githubLogin: E2E_OWNER.login,
        createdAt: now,
      },
      {
        id: "e2e-membership-viewer",
        orgId: E2E_ORG_ID,
        role: "viewer",
        userId: E2E_VIEWER.id,
        githubLogin: E2E_VIEWER.login,
        createdAt: now,
      },
    );
    db.projects.push({
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

    // Seed one open finding so viewer authz can open a detail page without
    // depending on a prior owner assessment in the same suite run.
    const findingId = "e2e-finding-img-alt";
    const assessmentId = "e2e-assessment-seed";
    const control =
      db.controls.find((candidate) => candidate.checkId === "img-alt") ??
      db.controls[0];
    db.assessments.push({
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
    });
    db.findings.push({
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
      engine: "ast",
      fix: {
        kind: "insert_attribute",
        attribute: "alt",
        value: "",
        editable: true,
        span: { start: 0, end: 20 },
      },
      explanations: [],
      detectedAt: now,
    });
    db.remediations.push({
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
    });
  });

  console.log(
    `E2E seed complete: org=${E2E_ORG_ID} project=${E2E_PROJECT_ID} owner=${E2E_OWNER.login}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
