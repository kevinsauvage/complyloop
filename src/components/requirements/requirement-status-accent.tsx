import { STATUS_TONE_ACCENT, requirementStatusDisplay } from "@/core/status-display";
import { cn } from "@/lib/utils";
import type { RequirementStatus } from "@complyloop/analysis-core/contract/statuses";

export function statusAccentClass(status: RequirementStatus): string {
  return STATUS_TONE_ACCENT[requirementStatusDisplay(status).tone];
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
