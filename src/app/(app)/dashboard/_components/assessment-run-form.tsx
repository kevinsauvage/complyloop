import { StatefulActionForm } from "@/components/forms/stateful-action-form";
import { runAssessmentAction } from "@/server/actions/assessment";
import {
  activeAssessmentJobForProject,
  recoverExpiredAssessmentLeases,
} from "@/server/assessment/assessment-jobs";

/**
 * Single Run-assessment trigger shared by the dashboard hero and checklist.
 *
 * Manual runs only enqueue — the scan drains through the worker queue, so
 * the button resolves in under a second and progress lives in the Pipeline
 * section (which polls `queued`/`running` jobs and refreshes on completion).
 * While a scan is live the button disables with an explanation instead of
 * stacking a second full scan behind the serial-per-project claim. A merely
 * queued job leaves the button enabled: the action re-kicks the worker
 * without enqueuing a duplicate, so it doubles as the retry when a dispatch
 * failed. Expired leases recover here first so a dead worker cannot pin the
 * button on "running" until the 15-minute schedule reclaims it.
 */
async function loadActiveJob(projectId: string) {
  await recoverExpiredAssessmentLeases();
  const activeJob = await activeAssessmentJobForProject(projectId);
  // Plain helper (not a component): `Date.now()` here keeps the component
  // body pure for `react-hooks/purity`.
  const now = Date.now();
  const leaseExpiresAt = activeJob?.leaseExpiresAt;
  const runningLive =
    activeJob?.status === "running" &&
    leaseExpiresAt !== undefined &&
    Number.isFinite(Date.parse(leaseExpiresAt)) &&
    Date.parse(leaseExpiresAt) > now;
  return { activeJob, runningLive };
}

export async function AssessmentRunForm({
  projectId,
  changedCount = 0,
}: {
  projectId: string;
  changedCount?: number;
}) {
  const { activeJob, runningLive } = await loadActiveJob(projectId);
  return (
    <div className="flex flex-col gap-1">
      <StatefulActionForm
        action={runAssessmentAction}
        submitLabel="Run assessment"
        pendingLabel="Queuing…"
        disabled={runningLive}
        refreshOnSuccess
      />
      {activeJob ? (
        <p className="text-xs text-muted-foreground" role="status">
          Assessment already{" "}
          {activeJob.status === "running" ? "running" : "queued"} — track it in
          the Pipeline below.
        </p>
      ) : changedCount > 0 ? (
        <p className="text-xs text-muted-foreground" role="status">
          {changedCount} file{changedCount === 1 ? "" : "s"} changed since the
          last scan — re-run to refresh.
        </p>
      ) : null}
    </div>
  );
}
