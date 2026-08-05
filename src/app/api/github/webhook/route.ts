import {
  handleGitHubWebhookEvent,
  isWebhookConfigured,
  verifyGitHubSignature,
} from "@/server/webhook";

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
  if (!verifyGitHubSignature(rawBody, signature)) {
    return Response.json({ error: "Invalid signature." }, { status: 401 });
  }

  const eventName = request.headers.get("x-github-event") ?? "";
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const result = handleGitHubWebhookEvent(eventName, payload);
  return Response.json(result, { status: result.handled ? 200 : 202 });
}
