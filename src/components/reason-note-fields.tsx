import { Label } from "@/components/ui/label";
import { nativeSelectClass } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

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
          className={cn(nativeSelectClass, "max-w-md")}
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
