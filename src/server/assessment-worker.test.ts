import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { testProject } from "@/test-fixtures/project";
import type { Db } from "./db";
import type { AssessmentJob } from "./assessment-jobs";

const claimNextAssessmentJob = vi.hoisted(() => vi.fn());
const completeAssessmentJob = vi.hoisted(() => vi.fn());
const failAssessmentJob = vi.hoisted(() => vi.fn());
const loadDb = vi.hoisted(() => vi.fn());
const withDbWrite = vi.hoisted(() => vi.fn());
const runAssessment = vi.hoisted(() => vi.fn());
const withProjectCheckout = vi.hoisted(() => vi.fn());
const reportError = vi.hoisted(() => vi.fn());
const reportWarning = vi.hoisted(() => vi.fn());
const resolveProjectGitHubToken = vi.hoisted(() => vi.fn());
const postPullRequestCheckRun = vi.hoisted(() => vi.fn());
const resolveProjectLoadScope = vi.hoisted(() => vi.fn());

vi.mock("./assessment-jobs", () => ({
  claimNextAssessmentJob: (...args: unknown[]) =>
    claimNextAssessmentJob(...args),
  completeAssessmentJob: (...args: unknown[]) =>
    completeAssessmentJob(...args),
  failAssessmentJob: (...args: unknown[]) => failAssessmentJob(...args),
}));

vi.mock("./db-store/client", () => ({
  getDrizzle: async () => ({}),
}));

vi.mock("./db-store/postgres-load", () => ({
  resolveProjectLoadScope: (...args: unknown[]) =>
    resolveProjectLoadScope(...args),
}));

vi.mock("./db", async () => {
  const actual = await vi.importActual<typeof import("./db")>("./db");
  return {
    ...actual,
    loadDb: (...args: unknown[]) => loadDb(...args),
    withDbWrite: (fn: (db: Db) => unknown, ...rest: unknown[]) =>
      withDbWrite(fn, ...rest),
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

function emptyDb(): Db {
  return {
    frameworks: [],
    controls: [],
    organizations: [],
    memberships: [],
    projects: [{ ...project }],
    requirements: [],
    assessments: [],
    findings: [],
    remediations: [],
    evidence: [],
    alerts: [],
  };
}

beforeEach(() => {
  resolveProjectLoadScope.mockResolvedValue({
    mode: "scoped",
    orgIds: ["org-1"],
    projectIds: ["p1"],
    evidenceLimit: 0,
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("processNextAssessmentJob", () => {
  it("returns idle when no job is claimed", async () => {
    claimNextAssessmentJob.mockResolvedValue(null);
    await expect(processNextAssessmentJob()).resolves.toEqual({ kind: "idle" });
    expect(completeAssessmentJob).not.toHaveBeenCalled();
  });

  it("runs assessment and completes on success", async () => {
    const db = emptyDb();
    claimNextAssessmentJob.mockResolvedValue(job());
    loadDb.mockResolvedValue(db);
    withProjectCheckout.mockImplementation(
      async (
        _project: unknown,
        fn: (rootPath: string) => Promise<unknown>,
      ) => fn("/tmp/checkout"),
    );
    withDbWrite.mockImplementation(async (fn: (db: Db) => unknown) => fn(db));
    runAssessment.mockResolvedValue({ id: "a1" });
    completeAssessmentJob.mockResolvedValue(undefined);

    await expect(processNextAssessmentJob()).resolves.toEqual({
      kind: "succeeded",
      jobId: "job-1",
    });
    expect(runAssessment).toHaveBeenCalledWith(db, "p1", {
      rootPath: "/tmp/checkout",
    });
    expect(completeAssessmentJob).toHaveBeenCalledWith("job-1");
    expect(
      db.evidence.some((row) => row.kind === "assessment_job_completed"),
    ).toBe(true);
  });

  it("retries when failAssessmentJob returns queued", async () => {
    claimNextAssessmentJob.mockResolvedValue(job({ attempts: 1 }));
    loadDb.mockResolvedValue(emptyDb());
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
    const db = emptyDb();
    claimNextAssessmentJob.mockResolvedValue(job({ attempts: 3 }));
    loadDb.mockResolvedValue(db);
    withProjectCheckout.mockRejectedValue(new Error("clone failed"));
    failAssessmentJob.mockResolvedValue("failed");
    withDbWrite.mockImplementation(async (fn: (db: Db) => unknown) => fn(db));

    await expect(processNextAssessmentJob()).resolves.toEqual({
      kind: "failed",
      jobId: "job-1",
    });
    expect(
      db.evidence.some((row) => row.kind === "assessment_job_failed"),
    ).toBe(true);
  });

  it("posts a PR check run for webhook jobs with a head sha", async () => {
    const db = emptyDb();
    claimNextAssessmentJob.mockResolvedValue(
      job({
        trigger: "webhook",
        payload: {
          eventName: "pull_request",
          pullRequestHeadSha: "abc123",
        },
      }),
    );
    loadDb.mockResolvedValue(db);
    withProjectCheckout.mockImplementation(
      async (
        _project: unknown,
        fn: (rootPath: string) => Promise<unknown>,
      ) => fn("/tmp/checkout"),
    );
    withDbWrite.mockImplementation(async (fn: (db: Db) => unknown) => fn(db));
    runAssessment.mockResolvedValue({ id: "a1" });
    completeAssessmentJob.mockResolvedValue(undefined);
    resolveProjectGitHubToken.mockResolvedValue("ghs_token");
    postPullRequestCheckRun.mockResolvedValue({ ok: true });

    await expect(processNextAssessmentJob()).resolves.toEqual({
      kind: "succeeded",
      jobId: "job-1",
    });
    expect(postPullRequestCheckRun).toHaveBeenCalledWith(
      expect.objectContaining({
        fullName: "acme/shop",
        headSha: "abc123",
        token: "ghs_token",
      }),
    );
  });

  it("warns when a PR check cannot be posted", async () => {
    const db = emptyDb();
    claimNextAssessmentJob.mockResolvedValue(
      job({
        trigger: "webhook",
        payload: { pullRequestHeadSha: "abc123" },
      }),
    );
    loadDb.mockResolvedValue(db);
    withProjectCheckout.mockImplementation(
      async (
        _project: unknown,
        fn: (rootPath: string) => Promise<unknown>,
      ) => fn("/tmp/checkout"),
    );
    withDbWrite.mockImplementation(async (fn: (db: Db) => unknown) => fn(db));
    runAssessment.mockResolvedValue({ id: "a1" });
    completeAssessmentJob.mockResolvedValue(undefined);
    resolveProjectGitHubToken.mockResolvedValue(null);

    await processNextAssessmentJob();
    expect(reportWarning).toHaveBeenCalledWith(
      expect.stringMatching(/GitHub token unavailable/),
      expect.objectContaining({ code: "github_token_missing" }),
    );
  });

});
