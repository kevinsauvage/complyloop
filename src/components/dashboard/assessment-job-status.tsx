import { formatDateTime } from "@/core/datetime";
import type { AssessmentJob } from "@/server/assessment-jobs";
import { runAssessmentAction } from "@/server/actions/assessment";
import { StatefulActionForm } from "@/components/stateful-action-form";
import { cn } from "@/lib/utils";
import { RefreshCw } from "lucide-react";

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
 * almost certainly means no worker is draining the queue (prod only drains
 * via `npm run worker`; see docs/deploy.md "Workers").
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

export function AssessmentJobStatus({
  jobs,
  canRetry = false,
  pollError = null,
}: {
  jobs: AssessmentJob[];
  canRetry?: boolean;
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
              Queued — results should appear shortly.
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
          Oldest queued job waiting {formatStallAge(stalledAge)} — jobs run only
          while a worker is active (
          <code className="font-mono">npm run worker</code>, see Workers in
          docs/deploy.md).
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
