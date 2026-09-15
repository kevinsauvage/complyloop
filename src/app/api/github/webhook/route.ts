import { after } from "next/server";
import { z } from "zod";

import { scheduleAssessmentDrain } from "@/server/assessment/assessment-job-inline";
import {
  handleGitHubWebhookEvent,
  isWebhookConfigured,
  verifyGitHubSignature,
} from "@/server/github/webhook";
import { claimWebhookDelivery } from "@/server/github/webhook-deliveries";
import { reportError } from "@/server/observability";

export const runtime = "nodejs";

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
 * advisory (absent under chunked transfer encoding), so the buffered body is
 * measured again after `request.text()`.
 */
const MAX_WEBHOOK_BODY_BYTES = 5 * 1024 * 1024;

export async function POST(request: Request): Promise<Response> {
  if (!isWebhookConfigured()) {
    return Response.json(
      { error: "GITHUB_WEBHOOK_SECRET is not configured." },
      { status: 503 },
    );
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > MAX_WEBHOOK_BODY_BYTES) {
    return Response.json(
      { error: "Webhook payload exceeds the 5 MB size limit." },
      { status: 413 },
    );
  }

  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > MAX_WEBHOOK_BODY_BYTES) {
    return Response.json(
      { error: "Webhook payload exceeds the 5 MB size limit." },
      { status: 413 },
    );
  }
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
  // Every handled delivery schedules a drain of the single-scan worker
  // route in `after()`: dev/e2e drains the queue inline, production
  // self-fetches `POST /api/internal/jobs/run?limit=1` so pushes start
  // scanning immediately. Each invocation claims one job
  // (serial-per-project); the scheduled sweep is the backstop for failed
  // fetches, killed tasks, and expired leases.
  if (result.handled) {
    after(() => scheduleAssessmentDrain());
  }
  return Response.json(
    { ...result, duplicate: !firstDelivery, deliveryId },
    { status: result.handled ? 200 : 202 },
  );
}
