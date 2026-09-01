import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function DismissFindingFields({
  reasonId,
  noteId,
}: {
  reasonId: string;
  noteId: string;
}) {
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={reasonId}>Reason</Label>
        <select
          id={reasonId}
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
        <Label htmlFor={noteId}>Note (kept as evidence)</Label>
        <Textarea id={noteId} name="note" rows={2} className="max-w-md" />
      </div>
    </>
  );
}
