import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { handleGitHubWebhookEvent, verifyGitHubSignature } from "./webhook";

vi.mock("./db", async () => {
  const actual = await vi.importActual<typeof import("./db")>("./db");
  return {
    ...actual,
    loadDb: vi.fn(),
  };
});

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

describe("handleGitHubWebhookEvent workspace missing", () => {
  it("returns a clear durable-disk error when the clone path is gone", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(loadDb).mockResolvedValue({
      frameworks: [],
      controls: [],
      organizations: [],
      memberships: [],
      projects: [
        {
          id: "p1",
          name: "acme/app",
          rootPath: "/tmp/definitely-missing-complyloop-workspace",
          source: "github",
          ownerUserId: "user-1",
          github: {
            fullName: "acme/app",
            defaultBranch: "main",
            private: false,
          },
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      activeProjectId: "p1",
      requirements: [],
      assessments: [],
      findings: [],
      remediations: [],
      evidence: [],
      alerts: [],
    });

    const result = await handleGitHubWebhookEvent("push", {
      repository: { full_name: "acme/app" },
      ref: "refs/heads/main",
    });

    expect(result.handled).toBe(false);
    expect(result.message).toMatch(/Workspace missing/);
    expect(result.message).toMatch(/durable DATA_DIR/);
    expect(spy).toHaveBeenCalled();
    const payload = JSON.parse(String(spy.mock.calls[0]?.[0])) as {
      code: string;
    };
    expect(payload.code).toBe("workspace_missing");
  });
});
