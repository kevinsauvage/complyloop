import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { E2E_PROJECT_ID } from "./constants";
import {
  MockGitHub,
  deliverWebhook,
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

async function emptyHeadingStatus(): Promise<string | null> {
  return withDb(async (sql) => {
    const rows = await sql<Array<{ status: string }>>`
      SELECT r.status
      FROM requirements r
      JOIN controls c ON c.id = r.control_id
      WHERE r.project_id = ${E2E_PROJECT_ID}
        AND (c.payload->>'checkId') = 'empty-heading'
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

      // The webhook-triggered job actually ran a re-assessment.
      await expect
        .poll(() =>
          withDb(async (sql) => {
            const rows = await sql<Array<{ n: number }>>`
              SELECT count(*)::int AS n
              FROM evidence
              WHERE project_id = ${E2E_PROJECT_ID}
                AND kind = 'assessment_job'
                AND detail->>'phase' = 'completed'
                AND detail->>'trigger' = 'webhook'
            `;
            return rows[0]?.n ?? 0;
          }),
          { timeout: 30_000 },
        )
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
