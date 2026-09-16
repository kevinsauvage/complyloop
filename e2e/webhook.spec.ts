import fs from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { shippedCatalog } from "@complyloop/analysis-core/catalog/catalog";

import { E2E_PROJECT_ID } from "./constants";
import {
  deliverWebhook,
  MockGitHub,
  pullRequestPayload,
  pushPayload,
  waitForJobSuccess,
  withDb,
} from "./webhook-helpers";

const fixturePath = path.join(
  process.cwd(),
  "e2e",
  "fixtures",
  "sample-app",
  "NewRegress.tsx",
);
const MOCK_GITHUB_PORT = Number(process.env.E2E_MOCK_GITHUB_PORT ?? 4109);

/** Content that introduces a NEW empty-heading violation not present in Bad.tsx. */
const NEW_REGRESS_CONTENT = `export function NewRegress() {
  return (
    <section>
      <h1 />
      <p>Body copy</p>
    </section>
  );
}
`;

/**
 * Merged fix for the violation above. The file must stay present with the
 * violation corrected: auto-verify is fail-closed and skips when the finding
 * file no longer exists (deletion resolves but never verifies), so simulating
 * the merge as a deletion can never produce a `verified` remediation.
 */
const FIXED_REGRESS_CONTENT = `export function NewRegress() {
  return (
    <section>
      <h1>New section</h1>
      <p>Body copy</p>
    </section>
  );
}
`;

const emptyHeadingControlId = shippedCatalog().controls.find(
  (control) => control.checkId === "empty-heading",
)?.id;

async function emptyHeadingStatus(): Promise<string | null> {
  if (!emptyHeadingControlId) {
    throw new Error("Shipped catalog is missing empty-heading control.");
  }
  return withDb(async (sql) => {
    const rows = await sql<Array<{ status: string }>>`
      SELECT r.status
      FROM requirements r
      WHERE r.project_id = ${E2E_PROJECT_ID}
        AND r.control_id = ${emptyHeadingControlId}
    `;
    return rows[0]?.status ?? null;
  });
}

async function regressionEvidenceCount(): Promise<number> {
  return withDb(async (sql) => {
    const rows = await sql<Array<{ n: number }>>`
      SELECT count(*)::int AS n
      FROM evidence
      WHERE project_id = ${E2E_PROJECT_ID}
        AND kind = 'requirement_status_changed'
        AND detail->>'regression' = 'true'
    `;
    return rows[0]?.n ?? 0;
  });
}

async function regressionAlertCount(): Promise<number> {
  return withDb(async (sql) => {
    const rows = await sql<Array<{ n: number }>>`
      SELECT count(*)::int AS n
      FROM alerts
      WHERE project_id = ${E2E_PROJECT_ID}
        AND payload->>'kind' = 'compliance_regression'
    `;
    return rows[0]?.n ?? 0;
  });
}

test.describe("webhook-driven continuous monitoring", () => {
  test("pull_request event re-assesses and posts a Check Run", async ({
    request,
  }) => {
    const headSha = "abcd1234ef567890".padEnd(40, "0");
    const mock = new MockGitHub();
    await mock.start(MOCK_GITHUB_PORT);

    try {
      const response = await deliverWebhook({
        request,
        eventName: "pull_request",
        payload: pullRequestPayload({ action: "opened", headSha }),
        deliveryId: `e2e-pr-${Date.now()}`,
      });
      expect(response.ok()).toBeTruthy();
      const body = await response.json();
      expect(body.handled).toBe(true);
      const jobId: string = body.jobId;
      await waitForJobSuccess({ jobId });

      // PR scans are non-authoritative previews (no assessment_job evidence);
      // job success + Check Run post proves the re-assessment ran.
      await expect
        .poll(() => Promise.resolve(mock.checkRuns.length), {
          timeout: 30_000,
        })
        .toBeGreaterThan(0);

      expect(mock.checkRuns).toHaveLength(1);
      const checkRun = mock.checkRuns[0];
      expect(checkRun.owner).toBe("e2e");
      expect(checkRun.repo).toBe("sample-app");
      expect(checkRun.body.name).toBe("ComplyLoop");
      expect(checkRun.body.head_sha).toBe(headSha);
      expect(["success", "failure", "neutral"]).toContain(
        checkRun.body.conclusion,
      );
      expect(checkRun.body.output?.summary).toContain("Assessment id");
    } finally {
      await mock.stop();
    }
  });

  test("draft-PR merge (push) re-assesses and verifies the approved remediation", async ({
    request,
  }) => {
    try {
      // 1. A violation lands on main and a webhook assessment records it.
      fs.writeFileSync(fixturePath, NEW_REGRESS_CONTENT);
      const detect = await deliverWebhook({
        request,
        eventName: "push",
        payload: pushPayload({ after: "e".repeat(40) }),
        deliveryId: `e2e-verify-detect-${Date.now()}`,
      });
      expect(detect.ok()).toBeTruthy();
      await waitForJobSuccess({ jobId: (await detect.json()).jobId });
      await expect
        .poll(() => emptyHeadingStatus(), { timeout: 30_000 })
        .toBe("failed");

      // 2. A human approved the remediation with the draft-PR action
      //    (the UI path; seeded directly to keep the fixture offline).
      const approved = await withDb(async (sql) => {
        const rows = await sql<Array<{ id: string }>>`
          UPDATE remediations r
          SET status = 'approved',
              payload = r.payload || jsonb_build_object(
                'status', 'approved',
                'approvalAction', 'create_draft_pull_request'
              )
          FROM findings f
          WHERE f.id = r.finding_id
            AND f.project_id = ${E2E_PROJECT_ID}
            AND f.status = 'open'
            AND f.payload->>'checkId' = 'empty-heading'
          RETURNING r.id
        `;
        return rows.length;
      });
      expect(approved).toBeGreaterThan(0);

      // 3. The draft PR merges — on GitHub that is a push to the monitored
      //    branch with the fix applied (file corrected in place, not deleted).
      fs.writeFileSync(fixturePath, FIXED_REGRESS_CONTENT);
      const merge = await deliverWebhook({
        request,
        eventName: "push",
        payload: pushPayload({ after: "f".repeat(40) }),
        deliveryId: `e2e-verify-merge-${Date.now()}`,
      });
      expect(merge.ok()).toBeTruthy();
      await waitForJobSuccess({ jobId: (await merge.json()).jobId });

      // 4. Deterministic reassessment closes the loop: requirement passes,
      //    the remediation is verified, and the evidence trail says how.
      await expect
        .poll(() => emptyHeadingStatus(), { timeout: 30_000 })
        .toBe("passed");
      await expect
        .poll(
          () =>
            withDb(async (sql) => {
              const rows = await sql<Array<{ n: number }>>`
                SELECT count(*)::int AS n
                FROM remediations r
                JOIN findings f ON f.id = r.finding_id
                WHERE f.project_id = ${E2E_PROJECT_ID}
                  AND f.payload->>'checkId' = 'empty-heading'
                  AND r.status = 'verified'
              `;
              return rows[0]?.n ?? 0;
            }),
          { timeout: 30_000 },
        )
        .toBeGreaterThan(0);
      await expect
        .poll(
          () =>
            withDb(async (sql) => {
              const rows = await sql<Array<{ n: number }>>`
                SELECT count(*)::int AS n
                FROM evidence
                WHERE project_id = ${E2E_PROJECT_ID}
                  AND kind = 'remediation_verified'
                  AND detail->>'method' = 'deterministic_reassessment'
              `;
              return rows[0]?.n ?? 0;
            }),
          { timeout: 30_000 },
        )
        .toBeGreaterThan(0);
    } finally {
      fs.rmSync(fixturePath, { force: true });
    }
  });

  test("push event re-assesses and surfaces a compliance regression alert", async ({
    request,
  }) => {
    // Baseline: ensure the extra fixture file is absent before the first push.
    fs.rmSync(fixturePath, { force: true });

    try {
      const baseline = await deliverWebhook({
        request,
        eventName: "push",
        payload: pushPayload(),
        deliveryId: `e2e-push-${Date.now()}`,
      });
      expect(baseline.ok()).toBeTruthy();
      const baselineBody = await baseline.json();
      expect(baselineBody.handled).toBe(true);
      await waitForJobSuccess({ jobId: baselineBody.jobId });

      // With a clean baseline, the empty-heading control must be passing.
      await expect
        .poll(() => emptyHeadingStatus(), { timeout: 30_000 })
        .toBe("passed");

      // Introduce a new violation on the monitored branch.
      fs.writeFileSync(fixturePath, NEW_REGRESS_CONTENT);

      const regression = await deliverWebhook({
        request,
        eventName: "push",
        payload: pushPayload({ after: "a".repeat(40) }),
        deliveryId: `e2e-push-${Date.now()}`,
      });
      expect(regression.ok()).toBeTruthy();
      const regressionBody = await regression.json();
      expect(regressionBody.handled).toBe(true);
      await waitForJobSuccess({ jobId: regressionBody.jobId });

      // empty-heading flipped passed → failed: a regression is recorded as
      // evidence AND surfaced as a compliance_regression alert.
      await expect
        .poll(() => emptyHeadingStatus(), { timeout: 30_000 })
        .toBe("failed");
      await expect
        .poll(() => regressionEvidenceCount(), { timeout: 30_000 })
        .toBeGreaterThan(0);
      await expect
        .poll(() => regressionAlertCount(), { timeout: 30_000 })
        .toBeGreaterThan(0);
    } finally {
      fs.rmSync(fixturePath, { force: true });
    }
  });
});
