import { createHash } from "node:crypto";

import { z } from "zod";

import { runAssessmentJobBatch } from "@/server/assessment-runner";
import { assertRateLimit, RateLimitError } from "@/server/rate-limit";
import {
  isWorkerAuthConfigured,
  isWorkerRequestAuthorized,
} from "@/server/worker-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Hashed so the bearer secret is never stored in the rate-limit table. */
function tokenFingerprint(header: string): string {
  return createHash("sha256").update(header).digest("hex").slice(0, 16);
}

const workerBatchSizeSchema = z
  .string()
  .optional()
  .transform((value) => {
    const parsed = value ? Number(value) : 1;
    if (!Number.isInteger(parsed) || parsed < 1) return 1;
    return Math.min(parsed, 10);
  });

const workerConcurrencySchema = z
  .string()
  .optional()
  .transform((value) => {
    const parsed = value ? Number(value) : 1;
    if (!Number.isInteger(parsed) || parsed < 1) return 1;
    return Math.min(parsed, 4);
  });

function requestedBatchSize(request: Request): number {
  return workerBatchSizeSchema.parse(
    new URL(request.url).searchParams.get("limit") ?? undefined,
  );
}

/**
 * Optional in-process pool size (1–4, default 1). Claims are per-project
 * exclusive, so this only raises throughput across independent projects;
 * schedulers that already fan out invocations can leave it at 1.
 */
function requestedConcurrency(request: Request): number {
  return workerConcurrencySchema.parse(
    new URL(request.url).searchParams.get("concurrency") ?? undefined,
  );
}

/**
 * Authenticated trigger for a scheduler or worker platform. Work is processed
 * sequentially per invocation; multiple invocations are safe because claims
 * and project leases are persisted in Postgres.
 */
export async function POST(request: Request): Promise<Response> {
  if (!isWorkerAuthConfigured()) {
    return Response.json({ error: "WORKER_SECRET is not configured." }, { status: 503 });
  }
  const authorization = request.headers.get("authorization");
  if (!isWorkerRequestAuthorized(authorization)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    await assertRateLimit(
      `worker-run:${tokenFingerprint(authorization ?? "")}`,
      120,
      60_000,
    );
  } catch (error) {
    if (error instanceof RateLimitError) {
      return Response.json({ error: error.message }, { status: 429 });
    }
    throw error;
  }

  const results = await runAssessmentJobBatch({
    limit: requestedBatchSize(request),
    concurrency: requestedConcurrency(request),
  });
  return Response.json({ results });
}
