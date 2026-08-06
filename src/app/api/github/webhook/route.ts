import {
  handleGitHubWebhookEvent,
  isWebhookConfigured,
  verifyGitHubSignature,
} from "@/server/webhook";
import {
  hasProcessedWebhookDelivery,
  recordWebhookDelivery,
} from "@/server/webhook-deliveries";

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

  const deliveryId = request.headers.get("x-github-delivery");
  if (deliveryId && (await hasProcessedWebhookDelivery(deliveryId))) {
    return Response.json(
      { duplicate: true, deliveryId, message: "Delivery already processed." },
      { status: 200 },
    );
  }

  const eventName = request.headers.get("x-github-event") ?? "";
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const result = await handleGitHubWebhookEvent(eventName, payload);
  if (deliveryId) {
    await recordWebhookDelivery(deliveryId);
  }
  return Response.json(
    { ...result, deliveryId: deliveryId ?? undefined },
    { status: result.handled ? 200 : 202 },
  );
}
