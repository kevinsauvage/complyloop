import { createHmac } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import { handleGitHubWebhookEvent, verifyGitHubSignature } from "./webhook";

const findProjectsByGithubFullName = vi.hoisted(() => vi.fn());
const getProjectById = vi.hoisted(() => vi.fn());
const drizzleExecute = vi.hoisted(() => vi.fn());
const enqueueAssessmentJob = vi.hoisted(() => vi.fn());
const assertRateLimit = vi.hoisted(() => vi.fn());

vi.mock("@complyloop/db/postgres", () => ({
  getDrizzle: async () => ({
    execute: (...args: unknown[]) => drizzleExecute(...args),
  }),
}));
vi.mock("@complyloop/db/repo/projects", () => ({
  findProjectsByGithubFullName: (...args: unknown[]) =>
    findProjectsByGithubFullName(...args),
  getProjectById: (...args: unknown[]) => getProjectById(...args),
}));
vi.mock("../assessment/assessment-jobs", () => ({ enqueueAssessmentJob }));
vi.mock("../rate-limit", () => ({ assertRateLimit }));

afterEach(() => {
  delete process.env.GITHUB_WEBHOOK_SECRET;
  vi.clearAllMocks();
});

describe("verifyGitHubSignature", () => {
  it("accepts a valid HMAC SHA-256 signature", async () => {
    process.env.GITHUB_WEBHOOK_SECRET = "test-secret";
    const body = '{"action":"opened"}';
    const digest = createHmac("sha256", "test-secret")
      .update(body)
      .digest("hex");
    expect(await verifyGitHubSignature(body, `sha256=${digest}`)).toBe(true);
  });

  it("rejects missing or invalid signatures", async () => {
    process.env.GITHUB_WEBHOOK_SECRET = "test-secret";
    expect(await verifyGitHubSignature("{}", null)).toBe(false);
    expect(await verifyGitHubSignature("{}", "sha256=deadbeef")).toBe(false);
  });

  it("rejects everything when no webhook secret is configured", async () => {
    delete process.env.GITHUB_WEBHOOK_SECRET;
    const body = '{"action":"opened"}';
    const digest = createHmac("sha256", "test-secret")
      .update(body)
      .digest("hex");
    expect(await verifyGitHubSignature(body, `sha256=${digest}`)).toBe(false);
    expect(await verifyGitHubSignature(body, null)).toBe(false);
  });
});

describe("handleGitHubWebhookEvent", () => {
  it("enqueues an idempotent push assessment without cloning in the request path", async () => {
    findProjectsByGithubFullName.mockResolvedValue([
      {
        id: "p1",
        orgId: "org-1",
        defaultBranch: "main",
      },
    ]);
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
      },
    });
    expect(result).toEqual({
      handled: true,
      message: "Queued re-assessment of acme/app.",
      jobId: "job-1",
    });
  });

  it("ignores push events to a non-default branch", async () => {
    findProjectsByGithubFullName.mockResolvedValue([
      {
        id: "p1",
        orgId: "org-1",
        defaultBranch: "main",
      },
    ]);

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

  it("accepts a webhook with a matching installation id", async () => {
    findProjectsByGithubFullName.mockResolvedValue([
      {
        id: "p1",
        orgId: "org-1",
        defaultBranch: "main",
        installationId: 12345,
      },
    ]);
    enqueueAssessmentJob.mockResolvedValue({ id: "job-install-match" });

    const result = await handleGitHubWebhookEvent(
      "push",
      {
        installation: { id: 12345 },
        repository: { full_name: "acme/app" },
        ref: "refs/heads/main",
        after: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      },
      "delivery-install-match",
    );

    expect(result.handled).toBe(true);
    expect(enqueueAssessmentJob).toHaveBeenCalled();
  });

  it("rejects a webhook with a foreign installation id on a same-named project", async () => {
    findProjectsByGithubFullName.mockResolvedValue([
      {
        id: "p1",
        orgId: "org-1",
        defaultBranch: "main",
        installationId: 12345,
      },
    ]);

    const result = await handleGitHubWebhookEvent(
      "push",
      {
        installation: { id: 99999 },
        repository: { full_name: "acme/app" },
        ref: "refs/heads/main",
        after: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      },
      "delivery-foreign-install",
    );

    expect(result.handled).toBe(false);
    expect(result.message).toMatch(/Installation id mismatch/);
    expect(enqueueAssessmentJob).not.toHaveBeenCalled();
  });

  it("routes a shared repo to the project bound to the delivery installation", async () => {
    findProjectsByGithubFullName.mockResolvedValue([
      { id: "p1", orgId: "org-1", installationId: 11111 },
      { id: "p2", orgId: "org-2", installationId: 22222 },
    ]);
    enqueueAssessmentJob.mockResolvedValue({ id: "job-2" });

    const result = await handleGitHubWebhookEvent(
      "push",
      {
        installation: { id: 22222 },
        repository: { full_name: "acme/app", default_branch: "main" },
        ref: "refs/heads/main",
        after: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      },
      "delivery-shared",
    );

    expect(result.handled).toBe(true);
    expect(enqueueAssessmentJob).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "p2" }),
    );
  });

  it("rejects an installation-less delivery for a repo connected in two orgs", async () => {
    findProjectsByGithubFullName.mockResolvedValue([
      { id: "p1", orgId: "org-1", installationId: 11111 },
      { id: "p2", orgId: "org-2" },
    ]);

    const result = await handleGitHubWebhookEvent(
      "push",
      {
        repository: { full_name: "acme/app" },
        ref: "refs/heads/main",
        after: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      },
      "delivery-ambiguous",
    );

    expect(result.handled).toBe(false);
    expect(result.message).toMatch(/Ambiguous project/);
    expect(enqueueAssessmentJob).not.toHaveBeenCalled();
  });

  it("rejects a delivery whose installation matches an unbound same-named row", async () => {
    // Old code picked the arbitrary row and skipped the installation check
    // when it had no installationId — scanning the wrong tenant.
    findProjectsByGithubFullName.mockResolvedValue([
      { id: "p1", orgId: "org-1" },
    ]);

    const result = await handleGitHubWebhookEvent(
      "push",
      {
        installation: { id: 99999 },
        repository: { full_name: "acme/app" },
        ref: "refs/heads/main",
        after: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      },
      "delivery-unbound",
    );

    expect(result.handled).toBe(false);
    expect(result.message).toMatch(/Installation id mismatch/);
    expect(enqueueAssessmentJob).not.toHaveBeenCalled();
  });

  it("enqueues a push to the live default branch and persists a rename", async () => {
    findProjectsByGithubFullName.mockResolvedValue([
      {
        id: "p1",
        orgId: "org-1",
        defaultBranch: "main",
      },
    ]);
    drizzleExecute.mockResolvedValue([]);
    getProjectById.mockResolvedValue({
      id: "p1",
      name: "App",
      source: "github",
      orgId: "org-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      github: { fullName: "acme/app", defaultBranch: "master", private: false },
    });
    enqueueAssessmentJob.mockResolvedValue({ id: "job-rename" });

    const result = await handleGitHubWebhookEvent(
      "push",
      {
        repository: { full_name: "acme/app", default_branch: "master" },
        ref: "refs/heads/master",
        after: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      },
      "delivery-rename",
    );

    expect(result.handled).toBe(true);
    // Atomic compare-and-set: single conditional UPDATE, then fresh read for
    // the authority decision.
    expect(drizzleExecute).toHaveBeenCalled();
    expect(getProjectById).toHaveBeenCalled();
    expect(enqueueAssessmentJob).toHaveBeenCalled();
  });

  it("ignores a push to the stale stored default after GitHub renamed it", async () => {
    findProjectsByGithubFullName.mockResolvedValue([
      {
        id: "p1",
        orgId: "org-1",
        defaultBranch: "main",
      },
    ]);
    drizzleExecute.mockResolvedValue([]);
    getProjectById.mockResolvedValue({
      id: "p1",
      name: "App",
      source: "github",
      orgId: "org-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      github: { fullName: "acme/app", defaultBranch: "master", private: false },
    });

    const result = await handleGitHubWebhookEvent(
      "push",
      {
        repository: { full_name: "acme/app", default_branch: "master" },
        ref: "refs/heads/main",
        after: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      },
      "delivery-stale-main",
    );

    expect(result.handled).toBe(false);
    expect(enqueueAssessmentJob).not.toHaveBeenCalled();
    // Authority is decided on the post-write row (master), so the stale-main
    // push is ignored even though the stored branch was main at read time.
    expect(drizzleExecute).toHaveBeenCalled();
    expect(getProjectById).toHaveBeenCalled();
  });

  it("skips the conditional write when the stored branch already matches", async () => {
    findProjectsByGithubFullName.mockResolvedValue([
      {
        id: "p1",
        orgId: "org-1",
        defaultBranch: "main",
      },
    ]);
    enqueueAssessmentJob.mockResolvedValue({ id: "job-same" });

    const result = await handleGitHubWebhookEvent(
      "push",
      {
        repository: { full_name: "acme/app", default_branch: "main" },
        ref: "refs/heads/main",
        after: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      },
      "delivery-same",
    );

    expect(result.handled).toBe(true);
    expect(drizzleExecute).not.toHaveBeenCalled();
    expect(getProjectById).not.toHaveBeenCalled();
    expect(enqueueAssessmentJob).toHaveBeenCalled();
  });

  it("ignores unsupported events without enqueuing work", async () => {
    await expect(
      handleGitHubWebhookEvent("ping", { zen: "ok" }),
    ).resolves.toEqual({
      handled: false,
      message: "Ignored event ping",
    });
    expect(enqueueAssessmentJob).not.toHaveBeenCalled();
  });

  it("rejects non-object payloads", async () => {
    await expect(handleGitHubWebhookEvent("push", null)).resolves.toEqual({
      handled: false,
      message: "Invalid payload",
    });
    expect(enqueueAssessmentJob).not.toHaveBeenCalled();
  });

  it("rejects events without a repository", async () => {
    await expect(
      handleGitHubWebhookEvent("push", {
        ref: "refs/heads/main",
        after: "a".repeat(40),
      }),
    ).resolves.toEqual({
      handled: false,
      message: "No repository in payload",
    });
    expect(enqueueAssessmentJob).not.toHaveBeenCalled();
  });

  it("ignores repositories with no connected project", async () => {
    findProjectsByGithubFullName.mockResolvedValue([]);
    await expect(
      handleGitHubWebhookEvent(
        "push",
        {
          repository: { full_name: "acme/unknown" },
          ref: "refs/heads/main",
          after: "a".repeat(40),
        },
        "delivery-unknown",
      ),
    ).resolves.toEqual({
      handled: false,
      message: "No connected project for acme/unknown",
    });
    expect(enqueueAssessmentJob).not.toHaveBeenCalled();
  });
});

describe("isWebhookConfigured", () => {
  it("reflects the webhook secret", async () => {
    const { isWebhookConfigured } = await import("./webhook");
    delete process.env.GITHUB_WEBHOOK_SECRET;
    expect(isWebhookConfigured()).toBe(false);
    process.env.GITHUB_WEBHOOK_SECRET = "secret";
    expect(isWebhookConfigured()).toBe(true);
  });
});
