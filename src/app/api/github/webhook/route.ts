import {
  handleGitHubWebhookEvent,
  isWebhookConfigured,
  verifyGitHubSignature,
} from "@/server/webhook";
import {
  drainAssessmentJobQueue,
  shouldDrainAssessmentJobsInline,
} from "@/server/assessment-job-inline";
import { claimWebhookDelivery } from "@/server/webhook-deliveries";
import { after } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const githubWebhookHeadersSchema = z.object({
  deliveryId: z
    .string()
    .trim()
    .min(1, { error: "x-github-delivery header is required." }),
  eventName: z.string(),
});

const githubWebhookPayloadSchema = z.record(z.string(), z.unknown());

export async function POST(request: Request): Promise<Response> {
  if (!isWebhookConfigured()) {
    return Response.json(
      { error: "GITHUB_WEBHOOK_SECRET is not configured." },
      { status: 503 },
    );
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > 5 * 1024 * 1024) {
    return Response.json(
      { error: "Webhook payload exceeds the 5 MB size limit." },
      { status: 413 },
    );
  }

  const rawBody = await request.text();
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

  const firstDelivery = await claimWebhookDelivery(deliveryId);
  let result: Awaited<ReturnType<typeof handleGitHubWebhookEvent>>;
  try {
    result = await handleGitHubWebhookEvent(eventName, payload, deliveryId);
  } catch {
    return Response.json(
      {
        error: "Could not queue the webhook assessment. GitHub may retry this delivery.",
        deliveryId,
      },
      { status: 503 },
    );
  }
  if (result.handled && shouldDrainAssessmentJobsInline()) {
    after(() => drainAssessmentJobQueue());
  }
  return Response.json(
    { ...result, duplicate: !firstDelivery, deliveryId },
    { status: result.handled ? 200 : 202 },
  );
}
