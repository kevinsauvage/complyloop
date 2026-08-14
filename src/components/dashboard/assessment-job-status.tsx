import type { AssessmentJob } from "@/server/assessment-jobs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/components/page-primitives";

const statusCopy: Record<AssessmentJob["status"], string> = {
  queued: "Queued",
  running: "Running",
  succeeded: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
};

export function AssessmentJobStatus({ jobs }: { jobs: AssessmentJob[] }) {
  if (jobs.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Assessment jobs</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-2" aria-label="Recent assessment jobs">
          {jobs.map((job) => (
            <li key={job.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm">
              <span>
                <span className="font-medium">{statusCopy[job.status]}</span>
                {" · "}
                {job.trigger === "webhook" ? "Webhook" : "Manual"} assessment
                {job.attempts > 1 ? ` · attempt ${job.attempts}` : ""}
              </span>
              <time className="text-xs text-muted-foreground" dateTime={job.createdAt}>
                {formatDateTime(job.createdAt)}
              </time>
              {job.error ? (
                <p className="basis-full text-xs text-destructive">{job.error}</p>
              ) : null}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
