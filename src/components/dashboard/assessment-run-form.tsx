import { StatefulActionForm } from "@/components/stateful-action-form";
import { runAssessmentAction } from "@/server/actions/assessment";
import { activeAssessmentJobForProject } from "@/server/assessment/assessment-jobs";

/**
 * Single Run-assessment trigger shared by the dashboard hero and checklist.
 *
 * Manual runs only enqueue — the scan drains through the worker queue, so
 * the button resolves in under a second and progress lives in the Pipeline
 * section (which polls `queued`/`running` jobs and refreshes on completion).
 * While a job is active the button disables with an explanation instead of
 * stacking a second full scan behind the serial-per-project claim.
 */
export async function AssessmentRunForm({
  projectId,
}: {
  projectId: string;
}) {
  const activeJob = await activeAssessmentJobForProject(projectId);
  const disabled = activeJob !== null;
  return (
    <div className="flex flex-col gap-1">
      <StatefulActionForm
        action={runAssessmentAction}
        submitLabel="Run assessment"
        pendingLabel="Queuing…"
        disabled={disabled}
        refreshOnSuccess
      />
      {disabled ? (
        <p className="text-xs text-muted-foreground" role="status">
          Assessment already{" "}
          {activeJob.status === "running" ? "running" : "queued"} — track it
          in the Pipeline below.
        </p>
      ) : null}
    </div>
  );
}
