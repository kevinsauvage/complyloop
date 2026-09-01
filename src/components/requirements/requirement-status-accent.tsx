import { cn } from "@/lib/utils";
import type { RequirementStatus } from "@/core/statuses";

export function statusAccentClass(status: RequirementStatus): string {
  switch (status) {
    case "passed":
      return "bg-status-passed";
    case "failed":
      return "bg-status-failed";
    case "needs_review":
      return "bg-status-review";
    case "not_applicable":
      return "bg-status-na";
    case "unable_to_verify":
      return "bg-status-unverifiable";
    default: {
      const _exhaustive: never = status;
      throw new Error(`Unhandled requirement status: ${_exhaustive}`);
    }
  }
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
