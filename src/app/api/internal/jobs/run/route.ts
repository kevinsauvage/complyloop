import { runAssessmentJobBatch } from "@/server/assessment-runner";
import {
  isWorkerAuthConfigured,
  isWorkerRequestAuthorized,
} from "@/server/worker-auth";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const workerBatchSizeSchema = z
  .string()
  .optional()
  .transform((value) => {
    const parsed = value ? Number(value) : 1;
    if (!Number.isInteger(parsed) || parsed < 1) return 1;
    return Math.min(parsed, 10);
  });

function requestedBatchSize(request: Request): number {
  return workerBatchSizeSchema.parse(
    new URL(request.url).searchParams.get("limit") ?? undefined,
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
  if (!isWorkerRequestAuthorized(request.headers.get("authorization"))) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const results = await runAssessmentJobBatch(requestedBatchSize(request));
  return Response.json({ results });
}
