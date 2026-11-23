import { type SQL, sql } from "drizzle-orm";

import type { AssessmentJobStatus } from "@complyloop/analysis-core/contract/assessment-jobs";

import { ASSESSMENT_QUEUE } from "../job-queue.ts";
import type { DrizzleDb } from "../postgres.ts";

/**
 * Read side of the assessment queue. Jobs live in pg-boss (`pgboss.job`);
 * writes go through its API (`src/server/assessment/assessment-job-lease.ts`),
 * reads that need a project filter or an ordering pg-boss does not offer are
 * plain SQL here. `data` holds `{ projectId, trigger, requestedByUserId,
 * idempotencyKey, payload }`.
 */
export interface AssessmentJobData {
  projectId: string;
  trigger: string;
  requestedByUserId?: string | null;
  idempotencyKey?: string | null;
  payload?: unknown;
}

export interface AssessmentJobRow {
  id: string;
  projectId: string;
  trigger: string;
  requestedByUserId: string | null;
  idempotencyKey: string | null;
  payload: unknown;
  status: AssessmentJobStatus;
  attempts: number;
  maxAttempts: number;
  availableAt: string;
  startedAt: string | null;
  leaseExpiresAt: string | null;
  completedAt: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

const QUEUED_STATES = sql`('created', 'retry')`;
const ACTIVE_STATES = sql`('created', 'retry', 'active')`;

function iso(column: SQL): SQL {
  return sql`to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;
}

const JOB_COLUMNS = sql`
  id::text AS id,
  data,
  state::text AS state,
  retry_count,
  retry_limit,
  output,
  ${iso(sql`start_after`)} AS start_after,
  ${iso(sql`created_on`)} AS created_on,
  ${iso(sql`started_on`)} AS started_on,
  ${iso(sql`completed_on`)} AS completed_on,
  ${iso(sql`least(
    started_on + make_interval(secs => expire_seconds),
    coalesce(heartbeat_on, started_on) + make_interval(secs => coalesce(heartbeat_seconds, expire_seconds))
  )`)} AS expires_on,
  ${iso(sql`greatest(created_on, started_on, completed_on, heartbeat_on)`)} AS updated_on
`;

interface RawJob extends Record<string, unknown> {
  id: string;
  data: AssessmentJobData | null;
  state: string;
  retry_count: number;
  retry_limit: number;
  output: unknown;
  start_after: string;
  created_on: string;
  started_on: string | null;
  completed_on: string | null;
  expires_on: string | null;
  updated_on: string;
}

export function statusOfJobState(state: string): AssessmentJobStatus {
  switch (state) {
    case "created":
    case "retry":
      return "queued";
    case "active":
      return "running";
    case "completed":
      return "succeeded";
    case "failed":
      return "failed";
    case "cancelled":
      return "cancelled";
    default:
      throw new Error(`Unexpected pg-boss job state: ${state}`);
  }
}

/** Our failures store `{ message }`; pg-boss's expiries `{ value: { message } }`. */
function errorOf(output: unknown): string | null {
  if (output === null || typeof output !== "object") return null;
  const { message, value } = output as { message?: unknown; value?: unknown };
  if (typeof message === "string") return message;
  return value === undefined ? null : errorOf(value);
}

function rowOf(raw: RawJob): AssessmentJobRow {
  const data = raw.data ?? { projectId: "", trigger: "" };
  const status = statusOfJobState(raw.state);
  const started = raw.started_on !== null;
  return {
    id: raw.id,
    projectId: String(data.projectId ?? ""),
    trigger: String(data.trigger ?? ""),
    requestedByUserId: data.requestedByUserId ?? null,
    idempotencyKey: data.idempotencyKey ?? null,
    payload: data.payload ?? null,
    status,
    attempts: started ? Number(raw.retry_count) + 1 : 0,
    maxAttempts: Number(raw.retry_limit) + 1,
    availableAt: raw.start_after,
    startedAt: raw.started_on,
    leaseExpiresAt: status === "running" ? raw.expires_on : null,
    completedAt: raw.completed_on,
    error:
      status === "failed" || raw.state === "retry" ? errorOf(raw.output) : null,
    createdAt: raw.created_on,
    updatedAt: raw.updated_on,
  };
}

async function selectJobs(
  drizzle: DrizzleDb,
  where: SQL,
  tail: SQL = sql``,
): Promise<AssessmentJobRow[]> {
  const rows = await drizzle.execute<RawJob>(sql`
    SELECT ${JOB_COLUMNS}
    FROM pgboss.job
    WHERE name = ${ASSESSMENT_QUEUE} AND ${where}
    ${tail}
  `);
  return [...rows].map(rowOf);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** pg-boss ids are uuids; anything else (a stale or forged id) matches no job. */
export function isAssessmentJobId(value: string): boolean {
  return UUID.test(value);
}

const projectIs = (projectId: string) => sql`data->>'projectId' = ${projectId}`;

export async function findAssessmentJobById(
  drizzle: DrizzleDb,
  id: string,
): Promise<AssessmentJobRow | undefined> {
  if (!isAssessmentJobId(id)) return undefined;
  const [row] = await selectJobs(drizzle, sql`id = ${id}::uuid`);
  return row;
}

/** Oldest still-queued job of one trigger for a project (coalescing target). */
export async function findOldestQueuedAssessmentJob(
  drizzle: DrizzleDb,
  projectId: string,
  trigger: string,
): Promise<AssessmentJobRow | undefined> {
  const [row] = await selectJobs(
    drizzle,
    sql`${projectIs(projectId)} AND data->>'trigger' = ${trigger} AND state IN ${QUEUED_STATES}`,
    sql`ORDER BY created_on ASC LIMIT 1`,
  );
  return row;
}

export async function listRecentAssessmentJobs(
  drizzle: DrizzleDb,
  projectId: string,
  limit: number,
): Promise<AssessmentJobRow[]> {
  return selectJobs(
    drizzle,
    projectIs(projectId),
    sql`ORDER BY created_on DESC LIMIT ${limit}`,
  );
}

/** The newest job of one trigger for a project, in any state. */
export async function findNewestAssessmentJob(
  drizzle: DrizzleDb,
  projectId: string,
  trigger: string,
): Promise<AssessmentJobRow | undefined> {
  const [row] = await selectJobs(
    drizzle,
    sql`${projectIs(projectId)} AND data->>'trigger' = ${trigger}`,
    sql`ORDER BY created_on DESC LIMIT 1`,
  );
  return row;
}

/** The project's oldest `queued`/`running` job. */
export async function findOldestActiveAssessmentJob(
  drizzle: DrizzleDb,
  projectId: string,
): Promise<AssessmentJobRow | undefined> {
  const [row] = await selectJobs(
    drizzle,
    sql`${projectIs(projectId)} AND state IN ${ACTIVE_STATES}`,
    sql`ORDER BY created_on ASC LIMIT 1`,
  );
  return row;
}

/** Newest job status per project, for the portfolio. */
export async function listLatestAssessmentJobs(
  drizzle: DrizzleDb,
  projectIds: readonly string[],
): Promise<AssessmentJobRow[]> {
  if (projectIds.length === 0) return [];
  const rows = await drizzle.execute<RawJob>(sql`
    SELECT DISTINCT ON (data->>'projectId') ${JOB_COLUMNS}
    FROM pgboss.job
    WHERE name = ${ASSESSMENT_QUEUE}
      AND data->>'projectId' IN ${sql`(${sql.join(
        projectIds.map((id) => sql`${id}`),
        sql`, `,
      )})`}
    ORDER BY data->>'projectId',
      greatest(created_on, started_on, completed_on, heartbeat_on) DESC, id DESC
  `);
  return [...rows].map(rowOf);
}

/**
 * Stamps the running job's pipeline stage into `data.payload` in one atomic
 * jsonb merge. Gated on `active`: it can neither resurrect a settled job nor
 * fight a cancel. False when the job is no longer running.
 */
export async function stampAssessmentJobStage(
  drizzle: DrizzleDb,
  jobId: string,
  stage: string,
  now: string,
): Promise<boolean> {
  if (!isAssessmentJobId(jobId)) return false;
  const updated = await drizzle.execute(sql`
    UPDATE pgboss.job
    SET data = jsonb_set(
      data,
      '{payload}',
      coalesce(data->'payload', '{}'::jsonb)
        || jsonb_build_object('stage', ${stage}::text, 'stageStartedAt', ${now}::text)
    )
    WHERE name = ${ASSESSMENT_QUEUE} AND id = ${jobId}::uuid AND state = 'active'
    RETURNING id
  `);
  return [...updated].length > 0;
}

/**
 * Current status of one job (apply-time cancel check), or undefined. With
 * `attempts`, a job another worker re-claimed since reads as undefined: this
 * worker's attempt is over even though the job is running again.
 */
export async function getAssessmentJobStatus(
  drizzle: DrizzleDb,
  jobId: string,
  attempts?: number,
): Promise<AssessmentJobStatus | undefined> {
  const [row] = await drizzle.execute<{
    state: string;
    retry_count: number;
  }>(sql`
    SELECT state::text AS state, retry_count FROM pgboss.job
    WHERE name = ${ASSESSMENT_QUEUE} AND id = ${jobId}::uuid
  `);
  if (!row) return undefined;
  if (attempts !== undefined && Number(row.retry_count) !== attempts - 1) {
    return undefined;
  }
  return statusOfJobState(row.state);
}

/**
 * Drops a deleted project's jobs. `data.projectId` has no foreign key, and a
 * job left behind would run against nothing and keep its payload (preview
 * URLs, refs) until retention. A running scan sees it on its next heartbeat.
 */
export async function deleteAssessmentJobsForProject(
  drizzle: DrizzleDb,
  projectId: string,
): Promise<void> {
  await drizzle.execute(sql`
    DELETE FROM pgboss.job
    WHERE name = ${ASSESSMENT_QUEUE} AND data->>'projectId' = ${projectId}
  `);
}

/**
 * Makes the job's current attempt its last, so failing it is terminal (a
 * payload no worker may run would fail identically on every retry).
 */
export async function exhaustAssessmentJobRetries(
  drizzle: DrizzleDb,
  jobId: string,
): Promise<void> {
  await drizzle.execute(sql`
    UPDATE pgboss.job SET retry_limit = retry_count
    WHERE name = ${ASSESSMENT_QUEUE} AND id = ${jobId}::uuid AND state = 'active'
  `);
}

/** Queue depth: `queued` + `running`. */
export async function countActiveAssessmentJobs(
  drizzle: DrizzleDb,
): Promise<number> {
  const [row] = await drizzle.execute<{ value: number }>(sql`
    SELECT count(*)::int AS value FROM pgboss.job
    WHERE name = ${ASSESSMENT_QUEUE} AND state IN ${ACTIVE_STATES}
  `);
  return Number(row?.value ?? 0);
}

/**
 * How long the oldest due `queued` job has waited (since it became due, so a
 * job in retry backoff or refreshed by coalescing does not read older), or
 * null when none are waiting.
 */
export async function oldestQueuedAssessmentJobAge(
  drizzle: DrizzleDb,
): Promise<number | null> {
  const [row] = await drizzle.execute<{ age_ms: string | null }>(sql`
    SELECT (EXTRACT(EPOCH FROM (now() - min(start_after))) * 1000)::bigint AS age_ms
    FROM pgboss.job
    WHERE name = ${ASSESSMENT_QUEUE} AND state IN ${QUEUED_STATES}
  `);
  if (row?.age_ms === null || row?.age_ms === undefined) return null;
  const parsed = Number(row.age_ms);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}
