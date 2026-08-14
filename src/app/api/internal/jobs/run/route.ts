import { processNextAssessmentJob } from "@/server/assessment-worker";
import {
  isWorkerAuthConfigured,
  isWorkerRequestAuthorized,
} from "@/server/worker-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function requestedBatchSize(request: Request): number {
  const value = new URL(request.url).searchParams.get("limit");
  const parsed = value ? Number(value) : 1;
  if (!Number.isInteger(parsed) || parsed < 1) return 1;
  return Math.min(parsed, 10);
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

  const results = [];
  for (let index = 0; index < requestedBatchSize(request); index += 1) {
    const result = await processNextAssessmentJob();
    results.push(result);
    if (result.kind === "idle") break;
  }
  return Response.json({ results });
}
