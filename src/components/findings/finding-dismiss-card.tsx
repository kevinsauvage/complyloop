import { StatefulActionForm } from "@/components/stateful-action-form";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { dismissFindingAction } from "@/server/actions/remediation-dismiss";

export function FindingDismissCard({ findingId }: { findingId: string }) {
  return (
    <StatefulActionForm
      action={dismissFindingAction.bind(null, findingId)}
      submitLabel="Dismiss finding"
      variant="destructive"
      className="flex flex-col gap-4"
      confirmMessage="Dismiss this finding? The reason and note are kept as evidence."
      confirmTitle="Dismiss finding"
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="dismiss-reason">Reason</Label>
        <select
          id="dismiss-reason"
          name="reason"
          defaultValue="false_positive"
          className="h-8 w-full max-w-md rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 dark:bg-input/30"
        >
          <option value="false_positive">False positive</option>
          <option value="not_applicable">Not applicable</option>
          <option value="accepted_risk">Accepted risk</option>
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="dismiss-note">Note (kept as evidence)</Label>
        <Textarea
          id="dismiss-note"
          name="note"
          rows={2}
          className="max-w-md"
        />
      </div>
    </StatefulActionForm>
  );
}
