import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { handleGitHubWebhookEvent, verifyGitHubSignature } from "./webhook";

const findProjectByGithubFullName = vi.hoisted(() => vi.fn());
const enqueueAssessmentJob = vi.hoisted(() => vi.fn());
const assertRateLimit = vi.hoisted(() => vi.fn());

vi.mock("@complyloop/db/client", () => ({
  getDrizzle: async () => ({}),
}));
vi.mock("@complyloop/db/postgres-queries", () => ({
  findProjectByGithubFullName: (...args: unknown[]) =>
    findProjectByGithubFullName(...args),
}));
vi.mock("./assessment-jobs", () => ({ enqueueAssessmentJob }));
vi.mock("./rate-limit", () => ({ assertRateLimit }));

afterEach(() => {
  delete process.env.GITHUB_WEBHOOK_SECRET;
  vi.clearAllMocks();
});

describe("verifyGitHubSignature", () => {
  it("accepts a valid HMAC SHA-256 signature", async () => {
    process.env.GITHUB_WEBHOOK_SECRET = "test-secret";
    const body = '{"action":"opened"}';
    const digest = createHmac("sha256", "test-secret").update(body).digest("hex");
    expect(await verifyGitHubSignature(body, `sha256=${digest}`)).toBe(true);
  });

  it("rejects missing or invalid signatures", async () => {
    process.env.GITHUB_WEBHOOK_SECRET = "test-secret";
    expect(await verifyGitHubSignature("{}", null)).toBe(false);
    expect(await verifyGitHubSignature("{}", "sha256=deadbeef")).toBe(false);
  });
});

describe("handleGitHubWebhookEvent", () => {
  it("enqueues an idempotent push assessment without cloning in the request path", async () => {
    findProjectByGithubFullName.mockResolvedValue({
      id: "p1",
      orgId: "org-1",
      defaultBranch: "main",
    });
    enqueueAssessmentJob.mockResolvedValue({ id: "job-1" });

    const result = await handleGitHubWebhookEvent(
      "push",
      {
        repository: { full_name: "acme/app" },
        ref: "refs/heads/main",
        after: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      },
      "delivery-1",
    );

    expect(assertRateLimit).toHaveBeenCalledWith("webhook:p1", 60, 60_000);
    expect(enqueueAssessmentJob).toHaveBeenCalledWith({
      projectId: "p1",
      trigger: "webhook",
      idempotencyKey: "delivery-1",
      payload: {
        ref: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        eventName: "push",
        pullRequestHeadSha: undefined,
      },
    });
    expect(result).toEqual({
      handled: true,
      message: "Queued re-assessment of acme/app.",
      jobId: "job-1",
    });
  });

  it("ignores push events to a non-default branch", async () => {
    findProjectByGithubFullName.mockResolvedValue({
      id: "p1",
      orgId: "org-1",
      defaultBranch: "main",
    });

    const result = await handleGitHubWebhookEvent(
      "push",
      {
        repository: { full_name: "acme/app" },
        ref: "refs/heads/feature/foo",
        after: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      },
      "delivery-feature",
    );

    expect(result.handled).toBe(false);
    expect(enqueueAssessmentJob).not.toHaveBeenCalled();
    // A feature branch must not consume the project webhook rate limit.
    expect(assertRateLimit).not.toHaveBeenCalled();
  });

  it("retains the PR head SHA for the worker Check Run", async () => {
    findProjectByGithubFullName.mockResolvedValue({ id: "p1", orgId: "org-1" });
    enqueueAssessmentJob.mockResolvedValue({ id: "job-2" });
    const headSha = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

    await handleGitHubWebhookEvent("pull_request", {
      action: "opened",
      repository: { full_name: "acme/app" },
      pull_request: { head: { sha: headSha } },
    });

    expect(enqueueAssessmentJob).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ ref: headSha, pullRequestHeadSha: headSha }),
      }),
    );
  });

  it("ignores unsupported events without enqueuing work", async () => {
    await expect(handleGitHubWebhookEvent("ping", { zen: "ok" })).resolves.toEqual({
      handled: false,
      message: "Ignored event ping",
    });
    expect(enqueueAssessmentJob).not.toHaveBeenCalled();
  });
});
