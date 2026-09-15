import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "./route";

const isWebhookConfigured = vi.hoisted(() => vi.fn());
const verifyGitHubSignature = vi.hoisted(() => vi.fn());
const handleGitHubWebhookEvent = vi.hoisted(() => vi.fn());
const claimWebhookDelivery = vi.hoisted(() => vi.fn());
const afterFn = vi.hoisted(() => vi.fn());

vi.mock("next/server", () => ({
  after: (...args: unknown[]) => afterFn(...args),
}));

vi.mock("@/server/assessment/assessment-job-inline", () => ({
  drainAssessmentJobQueue: vi.fn(),
  drainSingleAssessmentJobOpportunistically: vi.fn(),
  shouldDrainAssessmentJobsInline: () => false,
}));

vi.mock("@/server/github/webhook", () => ({
  isWebhookConfigured: () => isWebhookConfigured(),
  verifyGitHubSignature: (...args: unknown[]) => verifyGitHubSignature(...args),
  handleGitHubWebhookEvent: (...args: unknown[]) =>
    handleGitHubWebhookEvent(...args),
}));

vi.mock("@/server/github/webhook-deliveries", () => ({
  claimWebhookDelivery: (...args: unknown[]) => claimWebhookDelivery(...args),
}));

vi.mock("@/server/observability", () => ({
  reportError: vi.fn(),
}));

function webhookRequest(
  body: string,
  headers: Record<string, string> = {},
): Request {
  return new Request("http://localhost/api/github/webhook", {
    method: "POST",
    body,
    headers: {
      "content-type": "application/json",
      ...headers,
    },
  });
}

beforeEach(() => {
  isWebhookConfigured.mockReset();
  verifyGitHubSignature.mockReset();
  handleGitHubWebhookEvent.mockReset();
  claimWebhookDelivery.mockReset();
  afterFn.mockReset();
  isWebhookConfigured.mockReturnValue(true);
  verifyGitHubSignature.mockResolvedValue(true);
  claimWebhookDelivery.mockResolvedValue(true);
  handleGitHubWebhookEvent.mockResolvedValue({
    handled: true,
    message: "ok",
  });
});

describe("POST /api/github/webhook", () => {
  it("returns 503 when the webhook secret is not configured", async () => {
    isWebhookConfigured.mockReturnValue(false);
    const response = await POST(webhookRequest("{}"));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringMatching(/not configured/i),
    });
    expect(claimWebhookDelivery).not.toHaveBeenCalled();
  });

  it("rejects invalid signatures before claiming a delivery", async () => {
    verifyGitHubSignature.mockResolvedValue(false);
    const response = await POST(
      webhookRequest("{}", { "x-github-delivery": "del-1" }),
    );
    expect(response.status).toBe(401);
    expect(claimWebhookDelivery).not.toHaveBeenCalled();
  });

  it("requires x-github-delivery", async () => {
    const response = await POST(webhookRequest("{}"));
    expect(response.status).toBe(400);
    expect(claimWebhookDelivery).not.toHaveBeenCalled();
  });

  it("replays duplicate deliveries through idempotent queueing", async () => {
    claimWebhookDelivery.mockResolvedValue(false);
    const response = await POST(
      webhookRequest('{"zen":"ok"}', {
        "x-github-delivery": "del-dup",
        "x-github-event": "ping",
      }),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      duplicate: true,
      deliveryId: "del-dup",
    });
    expect(handleGitHubWebhookEvent).toHaveBeenCalledWith(
      "ping",
      { zen: "ok" },
      "del-dup",
    );
  });

  it("handles a valid event after claiming the delivery", async () => {
    const response = await POST(
      webhookRequest('{"ref":"refs/heads/main"}', {
        "x-github-delivery": "del-ok",
        "x-github-event": "push",
      }),
    );
    expect(response.status).toBe(200);
    expect(claimWebhookDelivery).toHaveBeenCalledWith("del-ok");
    expect(handleGitHubWebhookEvent).toHaveBeenCalledWith(
      "push",
      { ref: "refs/heads/main" },
      "del-ok",
    );
    await expect(response.json()).resolves.toMatchObject({
      handled: true,
      deliveryId: "del-ok",
    });
    expect(afterFn).toHaveBeenCalledTimes(1);
  });

  it("returns 202 when the event is acknowledged but not handled", async () => {
    handleGitHubWebhookEvent.mockResolvedValue({
      handled: false,
      message: "ignored",
    });
    const response = await POST(
      webhookRequest("{}", {
        "x-github-delivery": "del-ignored",
        "x-github-event": "ping",
      }),
    );
    expect(response.status).toBe(202);
  });

  it("rejects malformed bodies before recording a delivery", async () => {
    const first = await POST(
      webhookRequest("{not-json", {
        "x-github-delivery": "del-bad-json",
        "x-github-event": "push",
      }),
    );
    expect(first.status).toBe(400);
    expect(claimWebhookDelivery).not.toHaveBeenCalled();
    expect(handleGitHubWebhookEvent).not.toHaveBeenCalled();

    // A valid redelivery can still queue work because the malformed body was not claimed.
    const retry = await POST(
      webhookRequest('{"ref":"refs/heads/main"}', {
        "x-github-delivery": "del-bad-json",
        "x-github-event": "push",
      }),
    );
    expect(retry.status).toBe(200);
    expect(handleGitHubWebhookEvent).toHaveBeenCalledWith(
      "push",
      { ref: "refs/heads/main" },
      "del-bad-json",
    );
  });

  it("returns a retryable response when queueing throws", async () => {
    const { reportError } = await import("@/server/observability");
    handleGitHubWebhookEvent.mockRejectedValue(new Error("clone failed"));
    const response = await POST(
      webhookRequest('{"ref":"refs/heads/main"}', {
        "x-github-delivery": "del-throw",
        "x-github-event": "push",
      }),
    );
    expect(response.status).toBe(503);
    expect(claimWebhookDelivery).toHaveBeenCalledWith("del-throw");
    expect(reportError).toHaveBeenCalledWith(expect.any(Error), {
      code: "github_webhook_queue_failed",
      deliveryId: "del-throw",
      eventName: "push",
    });

    claimWebhookDelivery.mockResolvedValue(false);
    handleGitHubWebhookEvent.mockResolvedValue({
      handled: true,
      message: "queued",
    });
    const retry = await POST(
      webhookRequest('{"ref":"refs/heads/main"}', {
        "x-github-delivery": "del-throw",
        "x-github-event": "push",
      }),
    );
    expect(retry.status).toBe(200);
    await expect(retry.json()).resolves.toMatchObject({ duplicate: true });
  });

  it("returns a retryable response when claiming the delivery throws", async () => {
    const { reportError } = await import("@/server/observability");
    claimWebhookDelivery.mockRejectedValueOnce(new Error("db down"));
    const response = await POST(
      webhookRequest('{"ref":"refs/heads/main"}', {
        "x-github-delivery": "del-claim-throw",
        "x-github-event": "push",
      }),
    );
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      deliveryId: "del-claim-throw",
    });
    expect(handleGitHubWebhookEvent).not.toHaveBeenCalled();
    expect(reportError).toHaveBeenCalledWith(expect.any(Error), {
      code: "github_webhook_claim_failed",
      deliveryId: "del-claim-throw",
      eventName: "push",
    });
  });

  it("rejects oversized bodies without a content-length header", async () => {
    // Stream bodies carry no content-length (chunked transfer), which used to
    // bypass the size limit entirely.
    const big = `{"data":"${"x".repeat(5 * 1024 * 1024)}"}`;
    const request = new Request("http://localhost/api/github/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-github-delivery": "del-big",
        "x-github-event": "push",
      },
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(big));
          controller.close();
        },
      }),
      ...({ duplex: "half" } as Record<string, unknown>),
    });
    expect(request.headers.get("content-length")).toBeNull();

    const response = await POST(request);
    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringMatching(/size limit/i),
    });
    expect(verifyGitHubSignature).not.toHaveBeenCalled();
    expect(claimWebhookDelivery).not.toHaveBeenCalled();
    expect(handleGitHubWebhookEvent).not.toHaveBeenCalled();
  });
});
