import type { AssessmentJob } from "@/server/assessment/assessment-jobs";
import { recentAssessmentJobsForProject } from "@/server/assessment/assessment-jobs";

import { AssessmentJobStatusLive } from "./assessment-job-status-live";

/**
 * Live pipeline state only. Successful runs already land in the activity
 * feed as `Assessment completed` evidence, so keeping the full job history
 * here duplicated every scan twice on the same screen.
 */
function needsAttention(job: AssessmentJob): boolean {
  return (
    job.status === "queued" ||
    job.status === "running" ||
    job.status === "failed"
  );
}

/** Pipeline card, fetched independently so header/stats paint first. */
export async function DashboardPipelineSection({
  projectId,
  canRetry,
  canCancel,
}: {
  projectId: string;
  canRetry: boolean;
  canCancel: boolean;
}) {
  const recentJobs = await recentAssessmentJobsForProject(projectId);
  const jobs = recentJobs.filter(needsAttention);
  if (jobs.length === 0) return null;
  return (
    <AssessmentJobStatusLive
      key={jobs.map((job) => `${job.id}:${job.status}`).join("|")}
      projectId={projectId}
      initialJobs={jobs}
      canRetry={canRetry}
      canCancel={canCancel}
    />
  );
}

export function DashboardPipelineSkeleton() {
  return (
    <section aria-label="Pipeline" role="status" aria-busy="true">
      <p className="sr-only">Loading pipeline…</p>
      <div
        aria-hidden
        className="surface-panel flex items-center gap-3 rounded-xl px-5 py-4"
      >
        <span className="inline-flex size-2.5 shrink-0 rounded-full bg-signal" />
        <div className="flex flex-1 flex-col gap-2">
          <div className="h-4 w-1/2 rounded-md loading-shimmer" />
          <div className="h-3.5 w-1/3 rounded-md loading-shimmer" />
        </div>
      </div>
    </section>
  );
}
