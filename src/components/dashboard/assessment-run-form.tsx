import { StatefulActionForm } from "@/components/stateful-action-form";
import { runAssessmentAction } from "@/server/actions/assessment";

/** Single Run-assessment trigger shared by the dashboard hero and checklist. */
export function AssessmentRunForm() {
  return (
    <StatefulActionForm
      action={runAssessmentAction}
      submitLabel="Run assessment"
      pendingLabel="Assessing…"
    />
  );
}
