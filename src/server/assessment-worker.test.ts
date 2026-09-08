import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { testFinding } from "@/test-fixtures/finding";
import { testProject } from "@/test-fixtures/project";
import { testRemediation } from "@/test-fixtures/remediation";
import type { Db } from "@complyloop/db/types";
import { emptyDb as baseEmptyDb } from "@complyloop/db/types";
import type { AssessmentJob } from "./assessment-jobs";

const claimNextAssessmentJob = vi.hoisted(() => vi.fn());
const completeAssessmentJob = vi.hoisted(() => vi.fn());
const failAssessmentJob = vi.hoisted(() => vi.fn());
const loadProjectDb = vi.hoisted(() => vi.fn());
const runAssessment = vi.hoisted(() => vi.fn());
const withProjectCheckout = vi.hoisted(() => vi.fn());
const reportError = vi.hoisted(() => vi.fn());
const reportWarning = vi.hoisted(() => vi.fn());
const pruneRateLimitBuckets = vi.hoisted(() => vi.fn());
const resolveProjectGitHubToken = vi.hoisted(() => vi.fn());
const postPullRequestCheckRun = vi.hoisted(() => vi.fn());
const applyAssessmentPayload = vi.hoisted(() => vi.fn());
const insertEvidence = vi.hoisted(() => vi.fn());
const acquireNamedPostgresAdvisoryLock = vi.hoisted(() => vi.fn());
const transaction = vi.hoisted(() => vi.fn());

vi.mock("./assessment-jobs", () => ({
  claimNextAssessmentJob: (...args: unknown[]) =>
    claimNextAssessmentJob(...args),
  completeAssessmentJob: (...args: unknown[]) =>
    completeAssessmentJob(...args),
  failAssessmentJob: (...args: unknown[]) => failAssessmentJob(...args),
}));

vi.mock("@complyloop/db/client", () => ({
  getDrizzle: async () => ({ transaction }),
}));

vi.mock("@complyloop/db/repo/apply", async () => {
  const actual = await vi.importActual<
    typeof import("@complyloop/db/repo/apply")
  >("@complyloop/db/repo/apply");
  return {
    ...actual,
    applyAssessmentPayload: (...args: unknown[]) =>
      applyAssessmentPayload(...args),
    buildAssessmentApplyPayload: (input: unknown) => input,
  };
});

vi.mock("@complyloop/db/repo/evidence", () => ({
  insertEvidence: (...args: unknown[]) => insertEvidence(...args),
}));

vi.mock("@complyloop/db/write-lock", () => ({
  acquireNamedPostgresAdvisoryLock: (
    ...args: Parameters<typeof acquireNamedPostgresAdvisoryLock>
  ) => acquireNamedPostgresAdvisoryLock(...args),
  projectWriteLockKey: (projectId: string) => `project-write:${projectId}`,
}));

vi.mock("./db", async () => {
  const actual = await vi.importActual<typeof import("./db")>("./db");
  return {
    ...actual,
    loadProjectDb: (...args: unknown[]) => loadProjectDb(...args),
  };
});

vi.mock("./assessment", () => ({
  runAssessment: (...args: unknown[]) => runAssessment(...args),
}));

vi.mock("./repo-checkout", () => ({
  withProjectCheckout: (
    _project: unknown,
    fn: (rootPath: string) => Promise<unknown>,
    _ref?: unknown,
  ) => withProjectCheckout(_project, fn, _ref),
}));

vi.mock("./observability", () => ({
  reportError: (...args: unknown[]) => reportError(...args),
  reportWarning: (...args: unknown[]) => reportWarning(...args),
}));

vi.mock("./rate-limit", () => ({
  pruneRateLimitBuckets: (...args: unknown[]) => pruneRateLimitBuckets(...args),
}));

vi.mock("./github-access", () => ({
  resolveProjectGitHubToken: (...args: unknown[]) =>
    resolveProjectGitHubToken(...args),
}));

vi.mock("./github-checks", () => ({
  postPullRequestCheckRun: (...args: unknown[]) =>
    postPullRequestCheckRun(...args),
  summarizeAssessmentForCheckRun: () => ({
    conclusion: "success" as const,
    title: "ok",
    summary: "ok",
  }),
}));

import { processNextAssessmentJob } from "./assessment-worker";

const project = testProject({
  id: "p1",
  orgId: "org-1",
  github: {
    fullName: "acme/shop",
    defaultBranch: "main",
    private: false,
  },
});

function job(partial: Partial<AssessmentJob> = {}): AssessmentJob {
  return {
    id: "job-1",
    projectId: "p1",
    status: "running",
    trigger: "manual",
    payload: {},
    attempts: 1,
    maxAttempts: 3,
    availableAt: "2026-01-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

function projectDb(): Db {
  return {
    ...baseEmptyDb(),
    projects: [{ ...project }],
  };
}

function assessmentRun(
  assessment: {
    id: string;
    projectId: string;
    snapshot: { fileHashes: Record<string, string> };
  },
  slice: Partial<
    Pick<Db, "evidence" | "findings" | "remediations" | "requirements">
  > = {},
) {
  return {
    assessment,
    evidence: slice.evidence ?? [],
    findings: slice.findings ?? [],
    remediations: slice.remediations ?? [],
    requirements: slice.requirements ?? [],
  };
}

beforeEach(() => {
  transaction.mockImplementation(async (fn: (tx: object) => unknown) => fn({}));
  acquireNamedPostgresAdvisoryLock.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("processNextAssessmentJob", () => {
  it("returns idle when no job is claimed", async () => {
    claimNextAssessmentJob.mockResolvedValue(null);
    pruneRateLimitBuckets.mockResolvedValue(0);
    await expect(processNextAssessmentJob()).resolves.toEqual({ kind: "idle" });
    expect(completeAssessmentJob).not.toHaveBeenCalled();
    expect(pruneRateLimitBuckets).toHaveBeenCalledOnce();
  });

  it("still returns idle when rate-limit prune fails", async () => {
    claimNextAssessmentJob.mockResolvedValue(null);
    pruneRateLimitBuckets.mockRejectedValue(new Error("prune failed"));
    await expect(processNextAssessmentJob()).resolves.toEqual({ kind: "idle" });
    expect(reportWarning).toHaveBeenCalledWith(
      "prune failed",
      expect.objectContaining({ code: "rate_limit_prune_failed" }),
    );
  });

  it("runs assessment and completes on success", async () => {
    const db = projectDb();
    claimNextAssessmentJob.mockResolvedValue(job());
    loadProjectDb.mockResolvedValue(db);
    withProjectCheckout.mockImplementation(
      async (
        _project: unknown,
        fn: (rootPath: string) => Promise<unknown>,
      ) => fn("/tmp/checkout"),
    );
    runAssessment.mockResolvedValue(
      assessmentRun({
        id: "a1",
        projectId: "p1",
        snapshot: { fileHashes: {} },
      }),
    );
    completeAssessmentJob.mockResolvedValue(undefined);

    await expect(processNextAssessmentJob()).resolves.toEqual({
      kind: "succeeded",
      jobId: "job-1",
    });
    expect(runAssessment).toHaveBeenCalledWith(db, "p1", {
      rootPath: "/tmp/checkout",
      authoritative: true,
    });
    expect(applyAssessmentPayload).toHaveBeenCalled();
    expect(insertEvidence).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        kind: "assessment_job",
        detail: expect.objectContaining({ phase: "completed" }),
      }),
    );
    expect(completeAssessmentJob).toHaveBeenCalledWith("job-1");
    expect(pruneRateLimitBuckets).not.toHaveBeenCalled();
  });

  it("persists remediations after a run whose evidence snapshot is empty", async () => {
    const db = projectDb();
    db.evidence = [];
    db.findings = [testFinding()];
    db.remediations = [
      testRemediation({
        status: "approved",
        approvalAction: "create_draft_pull_request",
      }),
    ];
    claimNextAssessmentJob.mockResolvedValue(job());
    loadProjectDb.mockResolvedValue(db);
    withProjectCheckout.mockImplementation(
      async (
        _project: unknown,
        fn: (rootPath: string) => Promise<unknown>,
      ) => fn("/tmp/checkout"),
    );
    runAssessment.mockImplementation(async (liveDb: Db) => {
      liveDb.remediations[0] = {
        ...liveDb.remediations[0]!,
        status: "verified",
      };
      return assessmentRun(
        {
          id: "a1",
          projectId: "p1",
          snapshot: { fileHashes: {} },
        },
        {
          findings: liveDb.findings,
          remediations: liveDb.remediations,
          requirements: liveDb.requirements,
          evidence: [],
        },
      );
    });
    completeAssessmentJob.mockResolvedValue(undefined);

    await expect(processNextAssessmentJob()).resolves.toEqual({
      kind: "succeeded",
      jobId: "job-1",
    });
    expect(runAssessment).toHaveBeenCalledWith(db, "p1", {
      rootPath: "/tmp/checkout",
      authoritative: true,
    });
    expect(applyAssessmentPayload).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        remediations: [expect.objectContaining({ status: "verified" })],
        evidence: [],
      }),
      expect.objectContaining({
        loadedSlice: expect.objectContaining({
          requirements: [],
          findings: [expect.objectContaining({ id: "f1" })],
          remediations: expect.arrayContaining([
            expect.objectContaining({ status: "approved" }),
          ]),
          alerts: [],
        }),
      }),
    );
  });

  it("reuses the unread regression alert id per control instead of minting a new row (P2-1)", async () => {
    const db = projectDb();
    db.alerts = [
      {
        id: "alert-existing",
        projectId: "p1",
        kind: "compliance_regression",
        summary: "old regression",
        at: "2026-01-01T00:00:00.000Z",
        read: false,
        detail: { controlId: "c1" },
      },
      {
        id: "alert-read",
        projectId: "p1",
        kind: "compliance_regression",
        summary: "acknowledged regression",
        at: "2026-01-01T00:00:00.000Z",
        read: true,
        detail: { controlId: "c2" },
      },
    ];
    db.evidence = [
      {
        id: "ev-reg-1",
        at: "2026-01-02T00:00:00.000Z",
        kind: "requirement_status_changed",
        summary: "Control c1 regressed",
        projectId: "p1",
        controlId: "c1",
        assessmentId: "a1",
        detail: { regression: true },
      },
      {
        id: "ev-reg-2",
        at: "2026-01-02T00:00:00.000Z",
        kind: "requirement_status_changed",
        summary: "Control c2 regressed",
        projectId: "p1",
        controlId: "c2",
        assessmentId: "a1",
        detail: { regression: true },
      },
    ];
    claimNextAssessmentJob.mockResolvedValue(
      job({ trigger: "webhook", payload: { eventName: "push" } }),
    );
    loadProjectDb.mockResolvedValue(db);
    withProjectCheckout.mockImplementation(
      async (
        _project: unknown,
        fn: (rootPath: string) => Promise<unknown>,
      ) => fn("/tmp/checkout"),
    );
    runAssessment.mockResolvedValue(
      assessmentRun(
        {
          id: "a1",
          projectId: "p1",
          snapshot: { fileHashes: {} },
        },
        {
          evidence: db.evidence,
          findings: db.findings,
        },
      ),
    );
    completeAssessmentJob.mockResolvedValue(undefined);

    await expect(processNextAssessmentJob()).resolves.toEqual({
      kind: "succeeded",
      jobId: "job-1",
    });
    const payload = applyAssessmentPayload.mock.calls[0]?.[1] as {
      alerts: Array<{ id: string; detail?: Record<string, unknown> }>;
    };
    const alertForC1 = payload.alerts.find(
      (alert) => alert.detail?.controlId === "c1",
    );
    const alertForC2 = payload.alerts.find(
      (alert) => alert.detail?.controlId === "c2",
    );
    // Unread alert for the same control is refreshed in place.
    expect(alertForC1?.id).toBe("alert-existing");
    // A read alert does not swallow the recurrence — fresh row.
    expect(alertForC2?.id).not.toBe("alert-read");
  });

  it("retries when failAssessmentJob returns queued", async () => {
    claimNextAssessmentJob.mockResolvedValue(job({ attempts: 1 }));
    loadProjectDb.mockResolvedValue(projectDb());
    withProjectCheckout.mockRejectedValue(new Error("clone failed"));
    failAssessmentJob.mockResolvedValue("queued");

    await expect(processNextAssessmentJob()).resolves.toEqual({
      kind: "retrying",
      jobId: "job-1",
    });
    expect(reportError).toHaveBeenCalled();
    expect(completeAssessmentJob).not.toHaveBeenCalled();
  });

  it("records failure evidence when the job is terminal", async () => {
    const db = projectDb();
    claimNextAssessmentJob.mockResolvedValue(job({ attempts: 3 }));
    loadProjectDb.mockResolvedValue(db);
    withProjectCheckout.mockRejectedValue(new Error("clone failed"));
    failAssessmentJob.mockResolvedValue("failed");

    await expect(processNextAssessmentJob()).resolves.toEqual({
      kind: "failed",
      jobId: "job-1",
    });
    expect(insertEvidence).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        kind: "assessment_job",
        detail: expect.objectContaining({ phase: "failed" }),
      }),
    );
  });

  it("posts a PR check run for webhook jobs with a head sha", async () => {
    const db = projectDb();
    claimNextAssessmentJob.mockResolvedValue(
      job({
        trigger: "webhook",
        payload: {
          eventName: "pull_request",
          pullRequestHeadSha: "abc123",
        },
      }),
    );
    loadProjectDb.mockResolvedValue(db);
    withProjectCheckout.mockImplementation(
      async (
        _project: unknown,
        fn: (rootPath: string) => Promise<unknown>,
      ) => fn("/tmp/checkout"),
    );
    runAssessment.mockResolvedValue(
      assessmentRun({
        id: "a1",
        projectId: "p1",
        snapshot: { fileHashes: {} },
      }),
    );
    completeAssessmentJob.mockResolvedValue(undefined);
    resolveProjectGitHubToken.mockResolvedValue("ghs_token");
    postPullRequestCheckRun.mockResolvedValue({ ok: true });

    await expect(processNextAssessmentJob()).resolves.toEqual({
      kind: "succeeded",
      jobId: "job-1",
    });
    // A PR-head scan is a preview: it posts the Check Run but must not
    // persist any project compliance state.
    expect(runAssessment).toHaveBeenCalledWith(db, "p1", {
      rootPath: "/tmp/checkout",
      authoritative: false,
    });
    expect(applyAssessmentPayload).not.toHaveBeenCalled();
    expect(insertEvidence).not.toHaveBeenCalled();
    expect(postPullRequestCheckRun).toHaveBeenCalledWith(
      expect.objectContaining({
        fullName: "acme/shop",
        headSha: "abc123",
        token: "ghs_token",
      }),
    );
  });

  it("treats a default-branch webhook push as authoritative and persists", async () => {
    const db = projectDb();
    claimNextAssessmentJob.mockResolvedValue(
      job({
        trigger: "webhook",
        payload: { eventName: "push" },
      }),
    );
    loadProjectDb.mockResolvedValue(db);
    withProjectCheckout.mockImplementation(
      async (
        _project: unknown,
        fn: (rootPath: string) => Promise<unknown>,
      ) => fn("/tmp/checkout"),
    );
    runAssessment.mockResolvedValue(
      assessmentRun({
        id: "a1",
        projectId: "p1",
        snapshot: { fileHashes: {} },
      }),
    );
    completeAssessmentJob.mockResolvedValue(undefined);

    await expect(processNextAssessmentJob()).resolves.toEqual({
      kind: "succeeded",
      jobId: "job-1",
    });
    expect(runAssessment).toHaveBeenCalledWith(db, "p1", {
      rootPath: "/tmp/checkout",
      authoritative: true,
    });
    expect(applyAssessmentPayload).toHaveBeenCalled();
    expect(insertEvidence).toHaveBeenCalled();
  });

  it("warns when a PR check cannot be posted", async () => {
    const db = projectDb();
    claimNextAssessmentJob.mockResolvedValue(
      job({
        trigger: "webhook",
        payload: { pullRequestHeadSha: "abc123" },
      }),
    );
    loadProjectDb.mockResolvedValue(db);
    withProjectCheckout.mockImplementation(
      async (
        _project: unknown,
        fn: (rootPath: string) => Promise<unknown>,
      ) => fn("/tmp/checkout"),
    );
    runAssessment.mockResolvedValue(
      assessmentRun({
        id: "a1",
        projectId: "p1",
        snapshot: { fileHashes: {} },
      }),
    );
    completeAssessmentJob.mockResolvedValue(undefined);
    resolveProjectGitHubToken.mockResolvedValue(null);

    await processNextAssessmentJob();
    expect(reportWarning).toHaveBeenCalledWith(
      expect.stringMatching(/GitHub token unavailable/),
      expect.objectContaining({ code: "github_token_missing" }),
    );
  });
});
