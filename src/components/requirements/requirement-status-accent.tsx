import type { RequirementStatus } from "@complyloop/analysis-core/contract/statuses";

import { requirementStatusDisplay,STATUS_TONE_ACCENT } from "@/core/display";
import { cn } from "@/lib/utils";

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
