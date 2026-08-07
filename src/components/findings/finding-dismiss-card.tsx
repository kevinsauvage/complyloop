import { StatefulActionForm } from "@/components/stateful-action-form";
import { Card } from "@/components/ui";
import { dismissFindingAction } from "@/server/actions/remediation-dismiss";
import { secondaryButton } from "@/components/action-button-styles";

export function FindingDismissCard({ findingId }: { findingId: string }) {
  return (
    <Card title="Dismiss this finding">
      <StatefulActionForm
        action={dismissFindingAction.bind(null, findingId)}
        submitLabel="Dismiss finding"
        submitClassName={secondaryButton}
        className="flex flex-col gap-3"
        confirmMessage="Dismiss this finding? The reason and note are kept as evidence."
      >
        <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700">
          Reason
          <select
            name="reason"
            className="w-full max-w-md rounded-lg border border-zinc-300 px-3 py-2 text-sm font-normal"
          >
            <option value="false_positive">False positive</option>
            <option value="not_applicable">Not applicable</option>
            <option value="accepted_risk">Accepted risk</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700">
          Note (kept as evidence)
          <textarea
            name="note"
            rows={2}
            className="w-full max-w-md rounded-lg border border-zinc-300 px-3 py-2 text-sm font-normal"
          />
        </label>
      </StatefulActionForm>
    </Card>
  );
}
