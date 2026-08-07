import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { handleGitHubWebhookEvent, verifyGitHubSignature } from "./webhook";

const runAssessment = vi.hoisted(() =>
  vi.fn(() => ({ id: "assessment-1" })),
);
const resolveProjectGitHubToken = vi.hoisted(() =>
  vi.fn(async () => "ghs_test"),
);
const withRepoCheckout = vi.hoisted(() =>
  vi.fn(
    async (
      _options: unknown,
      fn: (rootPath: string) => Promise<unknown>,
    ) => fn("/tmp/ephemeral-checkout"),
  ),
);

vi.mock("./db", async () => {
  const actual = await vi.importActual<typeof import("./db")>("./db");
  const loadDb = vi.fn();
  return {
    ...actual,
    loadDb,
    withDbWrite: vi.fn(async (fn: (db: unknown) => unknown) => {
      const db = await loadDb();
      return fn(db);
    }),
  };
});

vi.mock("./assessment", () => ({
  runAssessment,
}));

vi.mock("./github-access", () => ({
  resolveProjectGitHubToken,
}));

vi.mock("./repo-checkout", () => ({
  withRepoCheckout: (
    options: unknown,
    fn: (rootPath: string) => Promise<unknown>,
  ) => withRepoCheckout(options, fn),
  withProjectCheckout: vi.fn(),
}));

import { loadDb } from "./db";

afterEach(() => {
  delete process.env.GITHUB_WEBHOOK_SECRET;
  vi.restoreAllMocks();
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

function projectDb() {
  return {
    frameworks: [],
    controls: [],
    organizations: [],
    memberships: [],
    projects: [
      {
        id: "p1",
        name: "acme/app",
        source: "github" as const,
        ownerUserId: "user-1",
        github: {
          fullName: "acme/app",
          defaultBranch: "main",
          private: false,
          installationId: 42,
        },
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    activeProjectId: "p1",
    requirements: [],
    assessments: [],
    findings: [],
    remediations: [],
    evidence: [] as Array<Record<string, unknown>>,
    alerts: [],
  };
}

describe("handleGitHubWebhookEvent clone failure", () => {
  it("returns a clear error when ephemeral checkout fails", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(loadDb).mockResolvedValue(projectDb() as never);
    withRepoCheckout.mockRejectedValueOnce(new Error("git clone failed: auth"));

    const result = await handleGitHubWebhookEvent("push", {
      repository: { full_name: "acme/app" },
      ref: "refs/heads/main",
    });

    expect(result.handled).toBe(false);
    expect(result.message).toMatch(/Failed to clone acme\/app/);
    expect(result.message).toMatch(/git clone failed/);
    expect(spy).toHaveBeenCalled();
    const payload = JSON.parse(String(spy.mock.calls[0]?.[0])) as {
      code: string;
    };
    expect(payload.code).toBe("webhook_clone_failed");
  });
});

describe("handleGitHubWebhookEvent reassessment", () => {
  it("checks out ephemerally, re-assesses, and records webhook evidence for a push", async () => {
    const db = projectDb();
    vi.mocked(loadDb).mockResolvedValue(db as never);
    withRepoCheckout.mockImplementation(
      async (_options, fn: (rootPath: string) => Promise<unknown>) =>
        fn("/tmp/ephemeral-checkout"),
    );

    const result = await handleGitHubWebhookEvent("push", {
      repository: { full_name: "acme/app" },
      ref: "refs/heads/main",
    });

    expect(resolveProjectGitHubToken).toHaveBeenCalled();
    expect(withRepoCheckout).toHaveBeenCalledWith(
      expect.objectContaining({
        fullName: "acme/app",
        accessToken: "ghs_test",
      }),
      expect.any(Function),
    );
    expect(runAssessment).toHaveBeenCalledWith(db, "p1", {
      rootPath: "/tmp/ephemeral-checkout",
    });
    expect(result.handled).toBe(true);
    expect(result.message).toMatch(/Re-assessed acme\/app/);
    expect(db.evidence.some((row) => row.kind === "webhook_reassessment")).toBe(
      true,
    );
  });
});
