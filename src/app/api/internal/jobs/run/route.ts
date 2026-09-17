import { createHash } from "node:crypto";

import { z } from "zod";

import { runAssessmentJobBatch } from "@/server/assessment/assessment-scheduler";
import {
  isWorkerAuthConfigured,
  isWorkerRequestAuthorized,
} from "@/server/assessment/worker-auth";
import { reportError, reportEvent, reportWarning } from "@/server/observability";
import { assertRateLimit, RateLimitError } from "@/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Serverless ceiling for one cron batch (Pro: up to 800; Hobby caps at 300).
 * Batches stay small (`limit` ≤ 10) so a slow clone/scan fits inside it.
 */
export const maxDuration = 300;

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
    reportWarning("assessment worker called without WORKER_SECRET", {
      code: "worker_secret_missing",
    });
    return Response.json(
      { error: "WORKER_SECRET is not configured." },
      { status: 503 },
    );
  }
  const authorization = request.headers.get("authorization");
  if (!isWorkerRequestAuthorized(authorization)) {
    // Never log the header value itself — its presence shape is enough to
    // distinguish a missing secret from a mismatched one (e.g. the sweep's
    // WORKER_SECRET secret drifting from the production env var, the classic
    // silent-drain failure).
    reportWarning("unauthorized assessment worker call", {
      code: "worker_unauthorized",
      hasAuthorizationHeader: authorization !== null,
    });
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
      reportWarning("assessment worker rate limited", {
        code: "worker_rate_limited",
      });
      return Response.json({ error: error.message }, { status: 429 });
    }
    throw error;
  }

  const limit = requestedBatchSize(request);
  const concurrency = requestedConcurrency(request);
  reportEvent("assessment worker batch started", {
    code: "worker_batch_started",
    limit,
    concurrency,
  });
  let results: Awaited<ReturnType<typeof runAssessmentJobBatch>>;
  try {
    results = await runAssessmentJobBatch({ limit, concurrency });
  } catch (error) {
    // Batch-level crash (claim transaction, lease recovery): per-job failures
    // never reach here, so this is always infra — Sentry + 500, not silence.
    reportError(error, {
      code: "worker_batch_failed",
      limit,
      concurrency,
    });
    return Response.json(
      { error: "Assessment batch failed." },
      { status: 500 },
    );
  }
  const byKind: Record<string, number> = {};
  for (const result of results) {
    byKind[result.kind] = (byKind[result.kind] ?? 0) + 1;
  }
  reportEvent("assessment worker batch finished", {
    code: "worker_batch_finished",
    limit,
    concurrency,
    ...byKind,
  });
  return Response.json({ results });
}
