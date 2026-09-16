import { RefreshCw } from "lucide-react";

import { StatefulActionForm } from "@/components/stateful-action-form";
import { formatDateTime } from "@/core/datetime";
import { cn } from "@/lib/utils";
import {
  cancelAssessmentJobAction,
  runAssessmentAction,
} from "@/server/actions/assessment";
import type { AssessmentJob } from "@/server/assessment/assessment-jobs";

const statusCopy: Record<AssessmentJob["status"], string> = {
  queued: "Queued",
  running: "Running",
  succeeded: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
};

const statusIndicator: Record<AssessmentJob["status"], string> = {
  queued: "bg-muted-foreground/50",
  running: "bg-signal animate-pulse",
  succeeded: "bg-status-passed",
  failed: "bg-status-failed",
  cancelled: "bg-muted-foreground/40",
};

/**
 * A job that has been ready longer than this with no worker picking it up
 * almost certainly means the queue backstop is failing. Manual and webhook
 * runs both queue (the dashboard action only enqueues); the GitHub Actions
 * `assessment-worker` drains via dispatch with its 15-min schedule as the
 * orphan backstop (see docs/vercel.md).
 */
export const WORKER_STALL_MS = 10 * 60_000;

/** Age of the oldest ready-but-unclaimed queued job, or null when healthy. */
export function stalledQueueAgeMs(
  jobs: ReadonlyArray<AssessmentJob>,
  now: number = Date.now(),
): number | null {
  let oldestReady: number | null = null;
  for (const job of jobs) {
    if (job.status !== "queued") continue;
    const readyAt = Date.parse(job.availableAt);
    // Unparseable or future availableAt is a scheduled retry, not a stuck job.
    if (Number.isNaN(readyAt) || readyAt > now) continue;
    oldestReady =
      oldestReady === null ? readyAt : Math.min(oldestReady, readyAt);
  }
  if (oldestReady === null) return null;
  const age = now - oldestReady;
  return age > WORKER_STALL_MS ? age : null;
}

function formatStallAge(ageMs: number): string {
  const minutes = Math.floor(ageMs / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/**
 * Age of a running scan past the stall threshold, or null when fresh.
 * Mirrors `stalledQueueAgeMs`: `now` defaults impurely here (not in render)
 * so the component stays pure for `react-hooks/purity`.
 */
export function longRunningAgeMs(
  startedAt: string,
  now: number = Date.now(),
): number | null {
  const started = Date.parse(startedAt);
  if (Number.isNaN(started)) return null;
  const ageMs = now - started;
  return ageMs > WORKER_STALL_MS ? ageMs : null;
}

/**
 * Explains a long-running scan: the worker holds a renewable lease while it
 * is alive, so a stuck `Running` past this point likely means a crashed
 * worker whose job will be retried — or cancel it below to stop it now.
 */
function RunningAgeNote({ startedAt }: { startedAt: string }) {
  const ageMs = longRunningAgeMs(startedAt);
  if (ageMs === null) return null;
  return (
    <p className="basis-full pl-5 text-xs text-muted-foreground" role="status">
      Running for {formatStallAge(ageMs)} — longer than expected. If the
      request was interrupted, the job is retried automatically when its lease
      expires; otherwise cancel it to stop the scan.
    </p>
  );
}

export function AssessmentJobStatus({
  jobs,
  canRetry = false,
  canCancel = false,
  pollError = null,
}: {
  jobs: AssessmentJob[];
  canRetry?: boolean;
  canCancel?: boolean;
  pollError?: string | null;
}) {
  if (jobs.length === 0 && !pollError) return null;
  const hasQueued = jobs.some((job) => job.status === "queued");
  const stalledAge = stalledQueueAgeMs(jobs);

  return (
    <div className="surface-panel rounded-xl p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-lg bg-signal/10 text-signal">
          <RefreshCw className="size-4" aria-hidden />
        </span>
        <div>
          <h3 className="text-sm font-semibold">Assessment jobs</h3>
          {pollError ? (
            <p className="text-xs text-destructive">{pollError}</p>
          ) : hasQueued ? (
            <p className="text-xs text-muted-foreground">
              Queued — the assessment worker picks it up automatically. This
              page updates when the scan finishes.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">Recent job history</p>
          )}
        </div>
      </div>
      {stalledAge !== null ? (
        <p
          className="mb-3 rounded-lg border border-signal/30 bg-signal/5 px-3 py-2 text-xs text-muted-foreground"
          role="status"
        >
          <span className="font-medium text-foreground">
            Assessment worker may be stopped.
          </span>{" "}
            Oldest queued job waiting {formatStallAge(stalledAge)} — scans
            are drained by the assessment-worker workflow (
            <code className="font-mono">repository_dispatch</code> + 15-min
            schedule, see docs/vercel.md).
        </p>
      ) : null}
      <ul className="flex flex-col gap-2" aria-label="Recent assessment jobs">
        {jobs.map((job) => (
          <li
            key={job.id}
            className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 rounded-lg border border-border/50 bg-muted/15 px-3 py-2.5 text-sm"
          >
            <span className="flex min-w-0 items-start gap-2.5">
              <span
                className={cn(
                  "mt-1.5 size-2 shrink-0 rounded-full",
                  statusIndicator[job.status],
                )}
                aria-hidden
              />
              <span>
                <span className="font-medium">{statusCopy[job.status]}</span>
                <span className="text-muted-foreground">
                  {" · "}
                  {job.trigger === "webhook" ? "Webhook" : "Manual"} assessment
                  {job.attempts > 1 ? ` · attempt ${job.attempts}` : ""}
                </span>
              </span>
            </span>
            <time
              className="font-mono text-xs text-muted-foreground"
              dateTime={job.createdAt}
            >
              {formatDateTime(job.createdAt)}
            </time>
            {job.error ? (
              <p className="basis-full pl-5 text-xs text-destructive">
                {job.error}
              </p>
            ) : null}
            {job.status === "running" && job.startedAt ? (
              <RunningAgeNote startedAt={job.startedAt} />
            ) : null}
            {canCancel &&
            (job.status === "queued" || job.status === "running") ? (
              <div className="basis-full pl-5 pt-1">
                <StatefulActionForm
                  action={cancelAssessmentJobAction}
                  submitLabel="Cancel job"
                  pendingLabel="Cancelling…"
                  variant="outline"
                  size="sm"
                  confirmTitle="Cancel this assessment?"
                  confirmMessage="The queued job is dropped; a running scan stops at the next checkpoint and saves nothing."
                >
                  <input type="hidden" name="jobId" value={job.id} />
                </StatefulActionForm>
              </div>
            ) : null}
            {canRetry && job.status === "failed" ? (
              <div className="basis-full pl-5 pt-1">
                <StatefulActionForm
                  action={runAssessmentAction}
                  submitLabel="Run assessment again"
                  pendingLabel="Queuing…"
                  variant="outline"
                  size="sm"
                />
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
