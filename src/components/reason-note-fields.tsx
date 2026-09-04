import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const selectClassName =
  "h-8 w-full max-w-md rounded-lg border border-input bg-transparent px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 dark:bg-input/30";

export function ReasonNoteFields({
  reasonId,
  noteId,
  reasonLabel = "Reason",
  noteLabel = "Note (kept as evidence)",
  defaultReason,
  options,
  noteRows = 2,
  noteRequired = false,
}: {
  reasonId: string;
  noteId: string;
  reasonLabel?: string;
  noteLabel?: string;
  defaultReason?: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  noteRows?: number;
  noteRequired?: boolean;
}) {
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={reasonId}>{reasonLabel}</Label>
        <select
          id={reasonId}
          name="reason"
          defaultValue={defaultReason ?? options[0]?.value}
          className={selectClassName}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={noteId}>{noteLabel}</Label>
        <Textarea
          id={noteId}
          name="note"
          rows={noteRows}
          required={noteRequired}
          className="max-w-md"
        />
      </div>
    </>
  );
}
