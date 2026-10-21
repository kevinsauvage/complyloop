import { createHmac } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { handleGitHubWebhookEvent, verifyGitHubSignature } from "./webhook";

const findProjectsByGithubFullName = vi.hoisted(() => vi.fn());
const getProjectById = vi.hoisted(() => vi.fn());
const drizzleExecute = vi.hoisted(() => vi.fn());
const enqueueAssessmentJob = vi.hoisted(() => vi.fn());
const assertRateLimit = vi.hoisted(() => vi.fn());
const latestWebhookJobRef = vi.hoisted(() => vi.fn());

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
vi.mock("../assessment/assessment-jobs", () => ({
  enqueueAssessmentJob,
  latestWebhookJobRef,
}));
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

  describe("deployment_status", () => {
    const sha = "b".repeat(40);
    const deployment = (overrides: Record<string, unknown> = {}) => ({
      repository: { full_name: "acme/app" },
      deployment: { sha, ref: "main" },
      deployment_status: {
        state: "success",
        environment_url: "https://app-abc123.vercel.app/some/path",
      },
      ...overrides,
    });

    beforeEach(() => {
      findProjectsByGithubFullName.mockResolvedValue([
        { id: "p1", orgId: "org-1", defaultBranch: "main" },
      ]);
      latestWebhookJobRef.mockResolvedValue(sha);
      enqueueAssessmentJob.mockResolvedValue({ id: "job-deploy" });
    });

    it("queues a runtime audit of the deployed origin tied to its SHA", async () => {
      const result = await handleGitHubWebhookEvent(
        "deployment_status",
        deployment(),
        "delivery-deploy",
      );
      expect(result.handled).toBe(true);
      expect(enqueueAssessmentJob).toHaveBeenCalledWith({
        projectId: "p1",
        trigger: "webhook",
        idempotencyKey: "delivery-deploy",
        payload: {
          ref: sha,
          eventName: "deployment_status",
          runtimeTarget: { url: "https://app-abc123.vercel.app", sha },
        },
      });
    });

    it("accepts a host that sends the commit SHA as the deployment ref", async () => {
      const result = await handleGitHubWebhookEvent(
        "deployment_status",
        deployment({ deployment: { sha, ref: sha } }),
        "delivery-sha-ref",
      );
      expect(result.handled).toBe(true);
      expect(enqueueAssessmentJob).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({
            runtimeTarget: { url: "https://app-abc123.vercel.app", sha },
          }),
        }),
      );
    });

    it("rejects a SHA ref that is not the deployment's own commit", async () => {
      const result = await handleGitHubWebhookEvent(
        "deployment_status",
        deployment({ deployment: { sha, ref: "c".repeat(40) } }),
        "delivery-other-sha",
      );
      expect(result.handled).toBe(false);
      expect(enqueueAssessmentJob).not.toHaveBeenCalled();
    });

    it("remembers the deployment on the project for manual runs", async () => {
      await handleGitHubWebhookEvent(
        "deployment_status",
        deployment(),
        "delivery-remember",
      );
      expect(drizzleExecute).toHaveBeenCalled();
    });

    it.each([
      [
        "a non-success state",
        {
          deployment_status: {
            state: "pending",
            environment_url: "https://x.vercel.app",
          },
        },
      ],
      ["a preview branch", { deployment: { sha, ref: "feature/x" } }],
      [
        "a non-https URL",
        {
          deployment_status: {
            state: "success",
            environment_url: "http://x.vercel.app",
          },
        },
      ],
      ["a missing URL", { deployment_status: { state: "success" } }],
      ["an invalid SHA", { deployment: { sha: "nope", ref: "main" } }],
    ])("ignores %s", async (_label, overrides) => {
      const result = await handleGitHubWebhookEvent(
        "deployment_status",
        deployment(overrides),
        "delivery-ignored",
      );
      expect(result.handled).toBe(false);
      expect(enqueueAssessmentJob).not.toHaveBeenCalled();
    });

    it("ignores a deployment of a commit a newer push replaced", async () => {
      latestWebhookJobRef.mockResolvedValue("c".repeat(40));
      const result = await handleGitHubWebhookEvent(
        "deployment_status",
        deployment(),
        "delivery-stale",
      );
      expect(result.handled).toBe(false);
      expect(result.message).toMatch(/not the latest pushed commit/);
      expect(enqueueAssessmentJob).not.toHaveBeenCalled();
    });
  });

  describe("tracked branch", () => {
    const sha = "d".repeat(40);

    it("accepts a push to the tracked branch when it differs from the default", async () => {
      findProjectsByGithubFullName.mockResolvedValue([
        {
          id: "p1",
          orgId: "org-1",
          defaultBranch: "main",
          trackedBranch: "develop",
        },
      ]);
      enqueueAssessmentJob.mockResolvedValue({ id: "job-tracked" });

      const result = await handleGitHubWebhookEvent(
        "push",
        {
          repository: { full_name: "acme/app" },
          ref: "refs/heads/develop",
          after: sha,
        },
        "delivery-tracked",
      );

      expect(result.handled).toBe(true);
      expect(enqueueAssessmentJob).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({ ref: sha, eventName: "push" }),
        }),
      );
    });

    it("ignores a push to the default branch once another branch is tracked", async () => {
      findProjectsByGithubFullName.mockResolvedValue([
        {
          id: "p1",
          orgId: "org-1",
          defaultBranch: "main",
          trackedBranch: "develop",
        },
      ]);

      const result = await handleGitHubWebhookEvent(
        "push",
        {
          repository: { full_name: "acme/app" },
          ref: "refs/heads/main",
          after: sha,
        },
        "delivery-main-ignored",
      );

      expect(result.handled).toBe(false);
      expect(result.message).toMatch(/tracked branch \(develop\)/);
      expect(enqueueAssessmentJob).not.toHaveBeenCalled();
    });

    it("ties a deployment of the tracked branch, not of the default branch", async () => {
      findProjectsByGithubFullName.mockResolvedValue([
        {
          id: "p1",
          orgId: "org-1",
          defaultBranch: "main",
          trackedBranch: "develop",
        },
      ]);
      latestWebhookJobRef.mockResolvedValue(sha);
      enqueueAssessmentJob.mockResolvedValue({ id: "job-deploy" });
      const payload = (ref: string) => ({
        repository: { full_name: "acme/app" },
        deployment: { sha, ref },
        deployment_status: {
          state: "success",
          environment_url: "https://develop-abc.vercel.app",
        },
      });

      const tracked = await handleGitHubWebhookEvent(
        "deployment_status",
        payload("develop"),
        "delivery-dep-develop",
      );
      expect(tracked.handled).toBe(true);

      enqueueAssessmentJob.mockClear();
      const other = await handleGitHubWebhookEvent(
        "deployment_status",
        payload("main"),
        "delivery-dep-main",
      );
      expect(other.handled).toBe(false);
      expect(enqueueAssessmentJob).not.toHaveBeenCalled();
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

  it("ignores a branch-deletion push with an all-zero after SHA", async () => {
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
        ref: "refs/heads/main",
        deleted: true,
        after: "0000000000000000000000000000000000000000",
      },
      "delivery-delete",
    );

    expect(result.handled).toBe(false);
    expect(enqueueAssessmentJob).not.toHaveBeenCalled();
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
