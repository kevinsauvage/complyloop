import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { WorkspaceSlice } from "@complyloop/db/types";
import { emptyWorkspaceSlice as baseEmptyDb } from "@complyloop/db/types";

import { testFinding } from "@/test-fixtures/finding";
import { testProject } from "@/test-fixtures/project";
import { testRemediation } from "@/test-fixtures/remediation";

import type { AssessmentJob } from "./assessment-jobs";

const claimNextAssessmentJob = vi.hoisted(() => vi.fn());
const completeAssessmentJob = vi.hoisted(() => vi.fn());
const failAssessmentJob = vi.hoisted(() => vi.fn());
const refreshAssessmentJobLease = vi.hoisted(() => vi.fn());
const updateAssessmentJobStage = vi.hoisted(() => vi.fn());
const loadProjectDb = vi.hoisted(() => vi.fn());
const runAssessment = vi.hoisted(() => vi.fn());
const withProjectCheckout = vi.hoisted(() => vi.fn());
const reportError = vi.hoisted(() => vi.fn());
const reportWarning = vi.hoisted(() => vi.fn());
const reportEvent = vi.hoisted(() => vi.fn());
const pruneRateLimitBuckets = vi.hoisted(() => vi.fn());
const applyAssessmentPayload = vi.hoisted(() => vi.fn());
const listAlertsForProject = vi.hoisted(() => vi.fn());
const insertEvidence = vi.hoisted(() => vi.fn());
const acquireNamedPostgresAdvisoryLock = vi.hoisted(() => vi.fn());
const transaction = vi.hoisted(() => vi.fn());
const runRemediationVerifyJob = vi.hoisted(() => vi.fn());

vi.mock("./remediation-verify-worker", () => ({
  runRemediationVerifyJob: (...args: unknown[]) =>
    runRemediationVerifyJob(...args),
}));

vi.mock("./assessment-jobs", async () => {
  const actual =
    await vi.importActual<typeof import("./assessment-jobs")>(
      "./assessment-jobs",
    );
  return {
    ...actual,
    claimNextAssessmentJob: (...args: unknown[]) =>
      claimNextAssessmentJob(...args),
    completeAssessmentJob: (...args: unknown[]) =>
      completeAssessmentJob(...args),
    failAssessmentJob: (...args: unknown[]) => failAssessmentJob(...args),
    refreshAssessmentJobLease: (...args: unknown[]) =>
      refreshAssessmentJobLease(...args),
    updateAssessmentJobStage: (...args: unknown[]) =>
      updateAssessmentJobStage(...args),
  };
});

vi.mock("@complyloop/db/postgres", () => ({
  getDrizzle: async () => ({ transaction }),
  acquireNamedPostgresAdvisoryLock: (
    ...args: Parameters<typeof acquireNamedPostgresAdvisoryLock>
  ) => acquireNamedPostgresAdvisoryLock(...args),
  projectWriteLockKey: (projectId: string) => `project-write:${projectId}`,
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

vi.mock("@complyloop/db/repo/alerts", () => ({
  listAlertsForProject: (...args: unknown[]) => listAlertsForProject(...args),
}));

vi.mock("@complyloop/db/repo/evidence", () => ({
  insertEvidence: (...args: unknown[]) => insertEvidence(...args),
}));

vi.mock("../workspace/db", async () => {
  const actual =
    await vi.importActual<typeof import("../workspace/db")>("../workspace/db");
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

vi.mock("../observability", () => ({
  reportError: (...args: unknown[]) => reportError(...args),
  reportWarning: (...args: unknown[]) => reportWarning(...args),
  reportEvent: (...args: unknown[]) => reportEvent(...args),
}));

vi.mock("../rate-limit", () => ({
  pruneRateLimitBuckets: (...args: unknown[]) => pruneRateLimitBuckets(...args),
}));

import { ASSESSMENT_JOB_HEARTBEAT_MS } from "./assessment-jobs";
import {
  processNextAssessmentJob,
  settleRunningAssessmentJob,
} from "./assessment-worker";

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
    startedAt: "2026-01-01T00:00:00.000Z",
    leaseExpiresAt: "2026-01-01T01:00:00.000Z",
    ...partial,
  };
}

function projectDb(): WorkspaceSlice {
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
    Pick<
      WorkspaceSlice,
      "evidence" | "findings" | "remediations" | "requirements"
    >
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
  transaction.mockImplementation(async (fn: (tx: object) => unknown) =>
    fn(stubTx("running")),
  );
  acquireNamedPostgresAdvisoryLock.mockResolvedValue(undefined);
  listAlertsForProject.mockResolvedValue([]);
});

/** Minimal tx stub: the apply re-checks the job status inside the transaction. */
function stubTx(jobStatus: string) {
  return {
    select: () => ({
      from: () => ({
        where: async () => [{ status: jobStatus }],
      }),
    }),
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("settleRunningAssessmentJob", () => {
  it("routes a verify_remediation job to the remediation verify handler", async () => {
    runRemediationVerifyJob.mockResolvedValue(undefined);
    completeAssessmentJob.mockResolvedValue(undefined);

    const verifyJob = job({
      trigger: "verify_remediation",
      payload: { findingId: "f1" },
    });
    await expect(settleRunningAssessmentJob(verifyJob)).resolves.toEqual({
      kind: "succeeded",
      jobId: "job-1",
    });
    expect(runRemediationVerifyJob).toHaveBeenCalledWith("f1");
    // The verify path must not run the assessment pipeline.
    expect(runAssessment).not.toHaveBeenCalled();
  });

  it("fails a verify_remediation job that carries no findingId", async () => {
    failAssessmentJob.mockResolvedValue("failed");

    await expect(
      settleRunningAssessmentJob(job({ trigger: "verify_remediation" })),
    ).resolves.toEqual({ kind: "failed", jobId: "job-1" });
    expect(runRemediationVerifyJob).not.toHaveBeenCalled();
  });

  it("retries a verify_remediation job when the re-audit throws", async () => {
    runRemediationVerifyJob.mockRejectedValue(new Error("browser died"));
    failAssessmentJob.mockResolvedValue("queued");

    await expect(
      settleRunningAssessmentJob(
        job({ trigger: "verify_remediation", payload: { findingId: "f1" } }),
      ),
    ).resolves.toEqual({ kind: "retrying", jobId: "job-1" });
  });

  it("runs an already-running job to completion without claiming", async () => {
    const db = projectDb();
    loadProjectDb.mockResolvedValue(db);
    withProjectCheckout.mockImplementation(
      async (_project: unknown, fn: (rootPath: string) => Promise<unknown>) =>
        fn("/tmp/checkout"),
    );
    runAssessment.mockResolvedValue(
      assessmentRun({
        id: "a1",
        projectId: "p1",
        snapshot: { fileHashes: {} },
      }),
    );
    completeAssessmentJob.mockResolvedValue(undefined);

    await expect(settleRunningAssessmentJob(job())).resolves.toEqual({
      kind: "succeeded",
      jobId: "job-1",
    });
    // The direct path supplies the job itself — no claim involved.
    expect(claimNextAssessmentJob).not.toHaveBeenCalled();
    expect(completeAssessmentJob).toHaveBeenCalledWith(
      expect.objectContaining({ id: "job-1" }),
    );
  });

  it("stamps checkout and apply stages on the job payload", async () => {
    loadProjectDb.mockResolvedValue(projectDb());
    withProjectCheckout.mockImplementation(
      async (_project: unknown, fn: (rootPath: string) => Promise<unknown>) =>
        fn("/tmp/checkout"),
    );
    runAssessment.mockResolvedValue(
      assessmentRun({
        id: "a1",
        projectId: "p1",
        snapshot: { fileHashes: {} },
      }),
    );
    completeAssessmentJob.mockResolvedValue(undefined);
    updateAssessmentJobStage.mockResolvedValue(true);

    await expect(settleRunningAssessmentJob(job())).resolves.toEqual({
      kind: "succeeded",
      jobId: "job-1",
    });
    // In-scan stages (changedetection/ast/…) ride runAssessment's onStage hook
    // (covered in assessment.test.ts); the worker owns checkout + apply.
    expect(updateAssessmentJobStage).toHaveBeenCalledWith("job-1", "checkout");
    expect(updateAssessmentJobStage).toHaveBeenCalledWith("job-1", "apply");
  });

  it("reports a terminal failure and records failure evidence", async () => {
    loadProjectDb.mockResolvedValue(projectDb());
    withProjectCheckout.mockRejectedValue(new Error("clone failed"));
    failAssessmentJob.mockResolvedValue("failed");

    await expect(
      settleRunningAssessmentJob(job({ attempts: 3 })),
    ).resolves.toEqual({ kind: "failed", jobId: "job-1" });
    expect(insertEvidence).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        kind: "assessment_job",
        detail: expect.objectContaining({ phase: "failed" }),
      }),
    );
  });

  it("records failure evidence without posting anywhere on terminal failure", async () => {
    loadProjectDb.mockResolvedValue(projectDb());
    withProjectCheckout.mockRejectedValue(new Error("clone failed"));
    failAssessmentJob.mockResolvedValue("failed");

    await expect(
      settleRunningAssessmentJob(
        job({
          attempts: 3,
          trigger: "webhook",
          payload: { ref: "a".repeat(40), eventName: "push" },
        }),
      ),
    ).resolves.toEqual({ kind: "failed", jobId: "job-1" });
    expect(insertEvidence).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        kind: "assessment_job",
        detail: expect.objectContaining({ phase: "failed" }),
      }),
    );
  });

  it("retries a failed scan without recording a terminal verdict", async () => {
    loadProjectDb.mockResolvedValue(projectDb());
    withProjectCheckout.mockRejectedValue(new Error("clone failed"));

    failAssessmentJob.mockResolvedValue("retrying");
    await expect(
      settleRunningAssessmentJob(
        job({
          attempts: 1,
          trigger: "webhook",
          payload: { ref: "a".repeat(40), eventName: "push" },
        }),
      ),
    ).resolves.toEqual({ kind: "retrying", jobId: "job-1" });
    expect(insertEvidence).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        kind: "assessment_job",
        detail: expect.objectContaining({ phase: "retrying" }),
      }),
    );
  });

  it("completes with the renewed lease after a heartbeat renewal", async () => {
    vi.useFakeTimers();
    try {
      loadProjectDb.mockResolvedValue(projectDb());
      withProjectCheckout.mockImplementation(
        async (_project: unknown, fn: (rootPath: string) => Promise<unknown>) =>
          fn("/tmp/checkout"),
      );
      let resolveRun!: (value: unknown) => void;
      runAssessment.mockReturnValue(
        new Promise((resolve) => {
          resolveRun = resolve;
        }),
      );
      const renewedLease = "2026-01-01T02:00:00.000Z";
      refreshAssessmentJobLease.mockResolvedValue(renewedLease);
      completeAssessmentJob.mockResolvedValue(undefined);

      const pending = settleRunningAssessmentJob(job());
      await vi.advanceTimersByTimeAsync(ASSESSMENT_JOB_HEARTBEAT_MS + 1);
      resolveRun(
        assessmentRun({
          id: "a1",
          projectId: "p1",
          snapshot: { fileHashes: {} },
        }),
      );

      await expect(pending).resolves.toEqual({
        kind: "succeeded",
        jobId: "job-1",
      });
      // The claim-time lease would no-op the guarded complete and the job
      // would be re-run by lease recovery — the renewed lease must win.
      expect(completeAssessmentJob).toHaveBeenCalledWith(
        expect.objectContaining({ id: "job-1", leaseExpiresAt: renewedLease }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("fails with the renewed lease when the run throws after a renewal", async () => {
    vi.useFakeTimers();
    try {
      loadProjectDb.mockResolvedValue(projectDb());
      const renewedLease = "2026-01-01T02:00:00.000Z";
      refreshAssessmentJobLease.mockResolvedValue(renewedLease);
      let rejectCheckout!: (reason: unknown) => void;
      withProjectCheckout.mockReturnValue(
        new Promise((_resolve, reject) => {
          rejectCheckout = reject;
        }),
      );
      failAssessmentJob.mockResolvedValue("failed");

      const pending = settleRunningAssessmentJob(job({ attempts: 3 }));
      await vi.advanceTimersByTimeAsync(ASSESSMENT_JOB_HEARTBEAT_MS + 1);
      rejectCheckout(new Error("clone failed"));

      await expect(pending).resolves.toEqual({
        kind: "failed",
        jobId: "job-1",
      });
      expect(failAssessmentJob).toHaveBeenCalledWith(
        expect.objectContaining({ id: "job-1", leaseExpiresAt: renewedLease }),
        expect.any(Error),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("records retrying evidence when the job will retry", async () => {
    loadProjectDb.mockResolvedValue(projectDb());
    withProjectCheckout.mockRejectedValue(new Error("clone failed"));
    failAssessmentJob.mockResolvedValue("queued");

    await expect(settleRunningAssessmentJob(job())).resolves.toEqual({
      kind: "retrying",
      jobId: "job-1",
    });
    expect(insertEvidence).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        kind: "assessment_job",
        detail: expect.objectContaining({ phase: "retrying" }),
      }),
    );
  });

  it("records superseded SHAs on the completion evidence", async () => {
    loadProjectDb.mockResolvedValue(projectDb());
    withProjectCheckout.mockImplementation(
      async (_project: unknown, fn: (rootPath: string) => Promise<unknown>) =>
        fn("/tmp/checkout"),
    );
    runAssessment.mockResolvedValue(
      assessmentRun({
        id: "a1",
        projectId: "p1",
        snapshot: { fileHashes: {} },
      }),
    );
    completeAssessmentJob.mockResolvedValue(undefined);

    await expect(
      settleRunningAssessmentJob(
        job({
          trigger: "webhook",
          payload: {
            ref: "abc123",
            eventName: "push",
            supersededRefs: ["def456"],
          },
        }),
      ),
    ).resolves.toEqual({ kind: "succeeded", jobId: "job-1" });
    expect(insertEvidence).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        kind: "assessment_job",
        detail: expect.objectContaining({
          phase: "completed",
          supersededRefs: ["def456"],
        }),
      }),
    );
  });

  it("discards the run when the job is cancelled mid-apply", async () => {
    loadProjectDb.mockResolvedValue(projectDb());
    withProjectCheckout.mockImplementation(
      async (_project: unknown, fn: (rootPath: string) => Promise<unknown>) =>
        fn("/tmp/checkout"),
    );
    runAssessment.mockResolvedValue(
      assessmentRun({
        id: "a1",
        projectId: "p1",
        snapshot: { fileHashes: {} },
      }),
    );
    // The apply-time re-check sees the job already left `running`: the
    // transaction rolls back and the worker reports cancellation.
    transaction.mockImplementationOnce(async (fn: (tx: object) => unknown) =>
      fn(stubTx("cancelled")),
    );

    await expect(settleRunningAssessmentJob(job())).resolves.toEqual({
      kind: "cancelled",
      jobId: "job-1",
    });
    expect(applyAssessmentPayload).not.toHaveBeenCalled();
    expect(insertEvidence).not.toHaveBeenCalled();
    expect(completeAssessmentJob).not.toHaveBeenCalled();
    expect(failAssessmentJob).not.toHaveBeenCalled();
    expect(reportError).not.toHaveBeenCalled();
  });
});

describe("processNextAssessmentJob", () => {
  it("returns idle when no job is claimed", async () => {
    claimNextAssessmentJob.mockResolvedValue(null);
    pruneRateLimitBuckets.mockResolvedValue(0);
    await expect(processNextAssessmentJob()).resolves.toEqual({ kind: "idle" });
    expect(completeAssessmentJob).not.toHaveBeenCalled();
    // Pruning now runs on the worker's wall-clock cadence, not per idle poll.
    expect(pruneRateLimitBuckets).not.toHaveBeenCalled();
  });

  it("runs assessment and completes on success", async () => {
    const db = projectDb();
    claimNextAssessmentJob.mockResolvedValue(job());
    loadProjectDb.mockResolvedValue(db);
    withProjectCheckout.mockImplementation(
      async (_project: unknown, fn: (rootPath: string) => Promise<unknown>) =>
        fn("/tmp/checkout"),
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
    expect(runAssessment).toHaveBeenCalledWith(
      expect.objectContaining({
        project: expect.objectContaining({ id: "p1" }),
      }),
      {
        rootPath: "/tmp/checkout",
        authoritative: true,
        onStage: expect.any(Function),
      },
    );
    expect(applyAssessmentPayload).toHaveBeenCalled();
    expect(insertEvidence).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        kind: "assessment_job",
        detail: expect.objectContaining({
          phase: "completed",
          leaseExpiresAt: "2026-01-01T01:00:00.000Z",
        }),
      }),
    );
    expect(completeAssessmentJob).toHaveBeenCalledWith(
      expect.objectContaining({ id: "job-1" }),
    );
    expect(pruneRateLimitBuckets).not.toHaveBeenCalled();
  });

  it("returns cancelled and saves nothing when the job is cancelled mid-run", async () => {
    vi.useFakeTimers();
    try {
      const db = projectDb();
      claimNextAssessmentJob.mockResolvedValue(job());
      loadProjectDb.mockResolvedValue(db);
      withProjectCheckout.mockImplementation(
        async (_project: unknown, fn: (rootPath: string) => Promise<unknown>) =>
          fn("/tmp/checkout"),
      );
      let resolveRun!: (value: unknown) => void;
      runAssessment.mockReturnValue(
        new Promise((resolve) => {
          resolveRun = resolve;
        }),
      );
      // The heartbeat finds the job gone from `running` (user cancelled).
      refreshAssessmentJobLease.mockResolvedValue(null);
      completeAssessmentJob.mockResolvedValue(undefined);

      const pending = processNextAssessmentJob();
      await vi.advanceTimersByTimeAsync(ASSESSMENT_JOB_HEARTBEAT_MS + 1);
      resolveRun(
        assessmentRun({
          id: "a1",
          projectId: "p1",
          snapshot: { fileHashes: {} },
        }),
      );

      await expect(pending).resolves.toEqual({
        kind: "cancelled",
        jobId: "job-1",
      });
      // Nothing persisted, nothing finalized, no failure recorded.
      expect(applyAssessmentPayload).not.toHaveBeenCalled();
      expect(insertEvidence).not.toHaveBeenCalled();
      expect(completeAssessmentJob).not.toHaveBeenCalled();
      expect(failAssessmentJob).not.toHaveBeenCalled();
      expect(reportError).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
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
      async (_project: unknown, fn: (rootPath: string) => Promise<unknown>) =>
        fn("/tmp/checkout"),
    );
    runAssessment.mockImplementation(
      async (input: {
        findings: WorkspaceSlice["findings"];
        remediations: WorkspaceSlice["remediations"];
        requirements: WorkspaceSlice["requirements"];
      }) => {
        input.remediations[0] = {
          ...input.remediations[0]!,
          status: "verified",
        };
        return assessmentRun(
          {
            id: "a1",
            projectId: "p1",
            snapshot: { fileHashes: {} },
          },
          {
            findings: input.findings,
            remediations: input.remediations,
            requirements: input.requirements,
            evidence: [],
          },
        );
      },
    );
    completeAssessmentJob.mockResolvedValue(undefined);

    await expect(processNextAssessmentJob()).resolves.toEqual({
      kind: "succeeded",
      jobId: "job-1",
    });
    expect(runAssessment).toHaveBeenCalledWith(
      expect.objectContaining({
        project: expect.objectContaining({ id: "p1" }),
      }),
      {
        rootPath: "/tmp/checkout",
        authoritative: true,
        onStage: expect.any(Function),
      },
    );
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
    const storedAlerts: WorkspaceSlice["alerts"] = [
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
    db.alerts = [...storedAlerts];
    db.findings = [
      testFinding({ id: "f-c1", projectId: "p1", controlId: "c1" }),
    ];
    // The worker matches against a fresh in-transaction read, not the
    // pre-scan slice: simulate an alert the user read mid-scan.
    listAlertsForProject.mockResolvedValue([
      { ...storedAlerts[0], read: true },
      storedAlerts[1],
    ]);
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
      async (_project: unknown, fn: (rootPath: string) => Promise<unknown>) =>
        fn("/tmp/checkout"),
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
    // The pre-scan slice still shows c1's alert as unread, but the fresh
    // in-transaction read shows it was read mid-scan — so a fresh row is
    // minted instead of resurrecting the acknowledged one in place.
    expect(alertForC1?.id).not.toBe("alert-existing");
    // A read alert does not swallow the recurrence — fresh row.
    expect(alertForC2?.id).not.toBe("alert-read");
  });

  it("refreshes the unread regression alert in place when the fresh read still shows it unread", async () => {
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
    ];
    listAlertsForProject.mockResolvedValue([...db.alerts]);
    claimNextAssessmentJob.mockResolvedValue(
      job({ trigger: "webhook", payload: { eventName: "push" } }),
    );
    loadProjectDb.mockResolvedValue(db);
    withProjectCheckout.mockImplementation(
      async (_project: unknown, fn: (rootPath: string) => Promise<unknown>) =>
        fn("/tmp/checkout"),
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
    expect(
      payload.alerts.find((alert) => alert.detail?.controlId === "c1")?.id,
    ).toBe("alert-existing");
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

  it("treats a legacy non-push webhook job as non-authoritative", async () => {
    const db = projectDb();
    claimNextAssessmentJob.mockResolvedValue(
      job({
        trigger: "webhook",
        payload: {
          eventName: "pull_request",
        },
      }),
    );
    loadProjectDb.mockResolvedValue(db);
    withProjectCheckout.mockImplementation(
      async (_project: unknown, fn: (rootPath: string) => Promise<unknown>) =>
        fn("/tmp/checkout"),
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
    // A legacy non-push webhook row runs the same analysis but must not
    // persist any project compliance state.
    expect(runAssessment).toHaveBeenCalledWith(
      expect.objectContaining({
        project: expect.objectContaining({ id: "p1" }),
      }),
      {
        rootPath: "/tmp/checkout",
        authoritative: false,
        onStage: expect.any(Function),
      },
    );
    expect(applyAssessmentPayload).not.toHaveBeenCalled();
    expect(insertEvidence).not.toHaveBeenCalled();
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
      async (_project: unknown, fn: (rootPath: string) => Promise<unknown>) =>
        fn("/tmp/checkout"),
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
    expect(runAssessment).toHaveBeenCalledWith(
      expect.objectContaining({
        project: expect.objectContaining({ id: "p1" }),
      }),
      {
        rootPath: "/tmp/checkout",
        authoritative: true,
        onStage: expect.any(Function),
      },
    );
    expect(applyAssessmentPayload).toHaveBeenCalled();
    expect(insertEvidence).toHaveBeenCalled();
  });

  it("retries when the project vanished before its job ran", async () => {
    claimNextAssessmentJob.mockResolvedValue(job());
    loadProjectDb.mockResolvedValue(baseEmptyDb());
    failAssessmentJob.mockResolvedValue("queued");

    await expect(processNextAssessmentJob()).resolves.toEqual({
      kind: "retrying",
      jobId: "job-1",
    });
    expect(withProjectCheckout).not.toHaveBeenCalled();
  });

  it("retries when the assessment has no snapshot", async () => {
    claimNextAssessmentJob.mockResolvedValue(job());
    loadProjectDb.mockResolvedValue(projectDb());
    withProjectCheckout.mockImplementation(
      async (_project: unknown, fn: (rootPath: string) => Promise<unknown>) =>
        fn("/tmp/checkout"),
    );
    runAssessment.mockResolvedValue({
      assessment: { id: "a1", projectId: "p1" },
      evidence: [],
      findings: [],
      remediations: [],
      requirements: [],
    });
    failAssessmentJob.mockResolvedValue("queued");

    await expect(processNextAssessmentJob()).resolves.toEqual({
      kind: "retrying",
      jobId: "job-1",
    });
    expect(completeAssessmentJob).not.toHaveBeenCalled();
  });

  it("warns when failure evidence cannot be recorded", async () => {
    claimNextAssessmentJob.mockResolvedValue(job({ attempts: 3 }));
    loadProjectDb
      .mockResolvedValueOnce(projectDb())
      .mockRejectedValueOnce(new Error("db gone"));
    withProjectCheckout.mockRejectedValue(new Error("clone failed"));
    failAssessmentJob.mockResolvedValue("failed");

    await expect(processNextAssessmentJob()).resolves.toEqual({
      kind: "failed",
      jobId: "job-1",
    });
    expect(reportWarning).toHaveBeenCalledWith(
      "db gone",
      expect.objectContaining({
        code: "assessment_job_failure_evidence_failed",
      }),
    );
  });
});
