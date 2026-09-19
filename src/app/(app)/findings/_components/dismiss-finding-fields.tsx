import { ReasonNoteFields } from "@/components/forms/reason-note-fields";

const DISMISSAL_REASON_OPTIONS = [
  { value: "false_positive", label: "False positive" },
  { value: "not_applicable", label: "Not applicable" },
  { value: "accepted_risk", label: "Accepted risk" },
] as const;

export function DismissFindingFields({
  reasonId,
  noteId,
}: {
  reasonId: string;
  noteId: string;
}) {
  return (
    <ReasonNoteFields
      reasonId={reasonId}
      noteId={noteId}
      defaultReason="false_positive"
      options={DISMISSAL_REASON_OPTIONS}
    />
  );
}
