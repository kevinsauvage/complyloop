import { PageSection } from "@/components/primitives/page-primitives";
import { recentAssessmentJobsForProject } from "@/server/assessment/assessment-jobs";

import { AssessmentJobStatusLive } from "./assessment-job-status-live";

/** Pipeline history, fetched independently so header/stats paint first. */
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
  return (
    <PageSection title="Pipeline" description="Recent assessment job history.">
      <AssessmentJobStatusLive
        key={recentJobs.map((job) => `${job.id}:${job.status}`).join("|")}
        projectId={projectId}
        initialJobs={recentJobs}
        canRetry={canRetry}
        canCancel={canCancel}
      />
    </PageSection>
  );
}

export function DashboardPipelineSkeleton() {
  return (
    <section aria-label="Pipeline" role="status" aria-busy="true">
      <p className="sr-only">Loading pipeline…</p>
      <div aria-hidden className="flex flex-col gap-2">
        <div className="h-5 w-32 rounded-md loading-shimmer" />
        <div className="h-4 w-56 max-w-full rounded-md loading-shimmer" />
        <div className="surface-panel flex items-center gap-3 rounded-xl px-5 py-4">
          <span className="flex size-2.5 shrink-0">
            <span className="inline-flex size-2.5 rounded-full bg-signal" />
          </span>
          <div className="flex flex-1 flex-col gap-2">
            <div className="h-4 w-1/2 rounded-md loading-shimmer" />
            <div className="h-3.5 w-1/3 rounded-md loading-shimmer" />
          </div>
        </div>
      </div>
    </section>
  );
}
