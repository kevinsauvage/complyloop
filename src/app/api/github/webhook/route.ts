import { after } from "next/server";
import { z } from "zod";

import { scheduleAssessmentDrain } from "@/server/assessment/assessment-scheduler";
import {
  handleGitHubWebhookEvent,
  isWebhookConfigured,
  verifyGitHubSignature,
} from "@/server/github/webhook";
import { claimWebhookDelivery } from "@/server/github/webhook-deliveries";
import { reportError } from "@/server/observability";

const githubWebhookHeadersSchema = z.object({
  deliveryId: z
    .string()
    .trim()
    .min(1, { error: "x-github-delivery header is required." }),
  eventName: z.string(),
});

const githubWebhookPayloadSchema = z.record(z.string(), z.unknown());

/**
 * Hard cap on webhook bodies. The `content-length` fast path below is
 * advisory (absent under chunked transfer encoding), so the stream is also
 * read with a hard byte counter.
 */
const MAX_WEBHOOK_BODY_BYTES = 5 * 1024 * 1024;

function payloadTooLarge(): Response {
  return Response.json(
    { error: "Webhook payload exceeds the 5 MB size limit." },
    { status: 413 },
  );
}

/**
 * Reads the body with a hard byte cap, aborting mid-stream once the cap is
 * exceeded. `request.text()` buffers the entire stream first, so a chunked
 * request (no `content-length`) could be read into memory unbounded before
 * signature verification. Returns null when oversized.
 */
async function readBoundedBody(request: Request): Promise<string | null> {
  const body = request.body;
  if (!body) return "";
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > MAX_WEBHOOK_BODY_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function POST(request: Request): Promise<Response> {
  if (!isWebhookConfigured()) {
    return Response.json(
      { error: "GITHUB_WEBHOOK_SECRET is not configured." },
      { status: 503 },
    );
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > MAX_WEBHOOK_BODY_BYTES) {
    return payloadTooLarge();
  }

  const rawBody = await readBoundedBody(request);
  if (rawBody === null) return payloadTooLarge();
  const signature = request.headers.get("x-hub-signature-256");
  if (!(await verifyGitHubSignature(rawBody, signature))) {
    return Response.json({ error: "Invalid signature." }, { status: 401 });
  }

  const headers = githubWebhookHeadersSchema.safeParse({
    deliveryId: request.headers.get("x-github-delivery") ?? "",
    eventName: request.headers.get("x-github-event") ?? "",
  });
  if (!headers.success) {
    return Response.json(
      { error: "x-github-delivery header is required." },
      { status: 400 },
    );
  }
  const { deliveryId, eventName } = headers.data;
  let payload: unknown;
  try {
    payload = githubWebhookPayloadSchema.parse(JSON.parse(rawBody));
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  let firstDelivery: boolean;
  try {
    firstDelivery = await claimWebhookDelivery(deliveryId);
  } catch (error) {
    // Delivery-claim write failed (DB down): GitHub retries on 503.
    reportError(error, {
      code: "github_webhook_claim_failed",
      deliveryId,
      eventName,
    });
    return Response.json(
      {
        error:
          "Could not record the webhook delivery. GitHub may retry this delivery.",
        deliveryId,
      },
      { status: 503 },
    );
  }
  let result: Awaited<ReturnType<typeof handleGitHubWebhookEvent>>;
  try {
    result = await handleGitHubWebhookEvent(eventName, payload, deliveryId);
  } catch (error) {
    // GitHub retries on 503 — but without this log the queueing failure is
    // invisible in Sentry and easy to miss in function logs.
    reportError(error, {
      code: "github_webhook_queue_failed",
      deliveryId,
      eventName,
    });
    return Response.json(
      {
        error:
          "Could not queue the webhook assessment. GitHub may retry this delivery.",
        deliveryId,
      },
      { status: 503 },
    );
  }
  // Every handled delivery schedules a drain in `after()`: dev/e2e drains
  // the queue inline, production kicks the GitHub Actions executor so pushes
  // start scanning immediately. Each invocation claims one job
  // (serial-per-project); the executor's 15-minute schedule is the backstop
  // for failed dispatches, killed tasks, and expired leases. Manual runs
  // share this queued path — the dashboard action enqueues and drains the
  // same way.
  if (result.handled) {
    after(() => scheduleAssessmentDrain());
  }
  return Response.json(
    { ...result, duplicate: !firstDelivery, deliveryId },
    { status: result.handled ? 200 : 202 },
  );
}
