import {
  handleGitHubWebhookEvent,
  isWebhookConfigured,
  verifyGitHubSignature,
} from "@/server/webhook";
import {
  drainAssessmentJobQueue,
  shouldDrainAssessmentJobsInline,
} from "@/server/assessment-job-drain";
import { claimWebhookDelivery } from "@/server/webhook-deliveries";
import { after } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  if (!isWebhookConfigured()) {
    return Response.json(
      { error: "GITHUB_WEBHOOK_SECRET is not configured." },
      { status: 503 },
    );
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");
  if (!(await verifyGitHubSignature(rawBody, signature))) {
    return Response.json({ error: "Invalid signature." }, { status: 401 });
  }

  const deliveryId = request.headers.get("x-github-delivery")?.trim() ?? "";
  if (!deliveryId) {
    return Response.json(
      { error: "x-github-delivery header is required." },
      { status: 400 },
    );
  }
  const eventName = request.headers.get("x-github-event") ?? "";
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
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
