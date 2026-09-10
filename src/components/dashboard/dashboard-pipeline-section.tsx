import { AssessmentJobStatusLive } from "@/components/dashboard/assessment-job-status-live";
import { PageSection } from "@/components/page-primitives";
import { recentAssessmentJobsForProject } from "@/server/assessment/assessment-jobs";

/** Pipeline history, fetched independently so header/stats paint first. */
export async function DashboardPipelineSection({
  projectId,
  canRetry,
}: {
  projectId: string;
  canRetry: boolean;
}) {
  const recentJobs = await recentAssessmentJobsForProject(projectId);
  return (
    <PageSection title="Pipeline" description="Recent assessment job history.">
      <AssessmentJobStatusLive
        key={recentJobs.map((job) => `${job.id}:${job.status}`).join("|")}
        projectId={projectId}
        initialJobs={recentJobs}
        canRetry={canRetry}
      />
    </PageSection>
  );
}

export function DashboardPipelineSkeleton() {
  return (
    <section aria-label="Pipeline">
      <p className="sr-only">Loading pipeline…</p>
      <div aria-hidden className="flex flex-col gap-2">
        <div className="h-5 w-32 animate-pulse rounded-md bg-muted/60" />
        <div className="h-16 animate-pulse rounded-xl border border-border/60 bg-card/40" />
      </div>
    </section>
  );
}
