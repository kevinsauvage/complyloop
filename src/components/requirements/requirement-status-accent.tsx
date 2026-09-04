import { STATUS_TONE_ACCENT, statusTone } from "@/core/status-tone";
import { cn } from "@/lib/utils";
import type { RequirementStatus } from "@complyloop/analysis-core/contract/statuses";

export function statusAccentClass(status: RequirementStatus): string {
  return STATUS_TONE_ACCENT[statusTone(status)];
}

export function RequirementStatusAccent({
  status,
}: {
  status: RequirementStatus;
}) {
  return (
    <span
      className={cn("absolute inset-y-0 left-0 w-1", statusAccentClass(status))}
      aria-hidden
    />
  );
}
