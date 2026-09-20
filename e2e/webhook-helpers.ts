import { createHmac } from "node:crypto";

import type { APIRequestContext } from "@playwright/test";
import postgres from "postgres";

import { E2E_PROJECT_FULL_NAME } from "./constants";
import { resolveSecret } from "./env";
import { resolveE2EDbUrl } from "./helpers";

/** Must match `GITHUB_WEBHOOK_SECRET` injected into the e2e webServer env. */
export function resolveWebhookSecret(): string {
  return resolveSecret("GITHUB_WEBHOOK_SECRET", "e2e-webhook-secret");
}

export async function withDb<T>(
  fn: (sql: postgres.Sql) => Promise<T>,
): Promise<T> {
  const sql = postgres(resolveE2EDbUrl(), { max: 3 });
  try {
    return await fn(sql);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export function signWebhookPayload(rawBody: string): string {
  return `sha256=${createHmac("sha256", resolveWebhookSecret())
    .update(rawBody)
    .digest("hex")}`;
}

export interface DeliverWebhookOptions {
  request: APIRequestContext;
  eventName: "push";
  payload: Record<string, unknown>;
  deliveryId: string;
}

/** Signs and delivers a GitHub webhook; returns the endpoint response. */
export async function deliverWebhook({
  request,
  eventName,
  payload,
  deliveryId,
}: DeliverWebhookOptions) {
  const rawBody = JSON.stringify(payload);
  return request.post("/api/github/webhook", {
    headers: {
      "content-type": "application/json",
      "x-github-event": eventName,
      "x-github-delivery": deliveryId,
      "x-hub-signature-256": signWebhookPayload(rawBody),
    },
    data: rawBody,
  });
}

export function pushPayload(opts: { after?: string; fullName?: string } = {}) {
  return {
    ref: "refs/heads/main",
    after: opts.after ?? "a".repeat(40),
    before: "b".repeat(40),
    repository: {
      full_name: opts.fullName ?? E2E_PROJECT_FULL_NAME,
      name: "sample-app",
    },
  };
}

export async function waitForJobSuccess(options: {
  jobId: string;
  timeoutMs?: number;
}): Promise<void> {
  const { jobId } = options;
  const timeoutMs = options.timeoutMs ?? 120_000;
  await withDb(async (sql) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const rows = await sql<
        Array<{ status: string; error: string | null }>
      >`SELECT status, error FROM assessment_jobs WHERE id = ${jobId}`;
      if (rows.length === 0) {
        throw new Error(`Assessment job ${jobId} not found.`);
      }
      const { status, error } = rows[0];
      if (status === "succeeded") return;
      if (status === "failed" || status === "cancelled") {
        throw new Error(
          `Assessment job ${jobId} ended with status "${status}": ${error ?? "no error"}`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
    throw new Error(`Timed out after ${timeoutMs}ms waiting for job ${jobId}.`);
  });
}
