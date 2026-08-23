import type { AssessmentJob } from "@/server/assessment-jobs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/components/page-primitives";
import { cn } from "@/lib/utils";

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

export function AssessmentJobStatus({ jobs }: { jobs: AssessmentJob[] }) {
  if (jobs.length === 0) return null;
  return (
    <Card className="shadow-none ring-1 ring-border/60">
      <CardHeader>
        <CardTitle>Assessment jobs</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-3" aria-label="Recent assessment jobs">
          {jobs.map((job) => (
            <li
              key={job.id}
              className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5 text-sm"
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
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
