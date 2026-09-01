import Link from "next/link";
import { RequirementStatusBadge } from "@/components/badges";
import { requirementsStatusHref } from "@/core/requirement-status-filter";
import { REQUIREMENT_STATUS_DISPLAY_ORDER } from "@/core/statuses";
import { cn } from "@/lib/utils";
import type { RequirementStatus } from "@/core/statuses";

export function RequirementsStatusChips({
  counts,
  selected,
}: {
  counts: Map<RequirementStatus, number>;
  selected: RequirementStatus | undefined;
}) {
  return (
    <ul
      className="mb-6 flex flex-wrap gap-2"
      aria-label="Requirement status filter"
    >
      {selected ? (
        <li>
          <Link
            href={requirementsStatusHref()}
            className={cn(
              "flex items-center gap-2 rounded-lg border border-border/60 bg-card/60 px-2.5 py-1.5 text-sm font-medium",
              "outline-none transition-colors hover:bg-accent/40 hover:ring-1 hover:ring-signal/40",
              "focus-visible:ring-2 focus-visible:ring-ring",
            )}
          >
            All
          </Link>
        </li>
      ) : null}
      {REQUIREMENT_STATUS_DISPLAY_ORDER.map((status) => {
        const count = counts.get(status) ?? 0;
        if (count === 0) return null;
        const isSelected = selected === status;
        return (
          <li key={status}>
            <Link
              href={
                isSelected
                  ? requirementsStatusHref()
                  : requirementsStatusHref(status)
              }
              aria-current={isSelected ? "true" : undefined}
              className={cn(
                "flex items-center gap-2 rounded-lg border bg-card/60 px-2.5 py-1.5",
                "outline-none transition-colors hover:bg-accent/40",
                "focus-visible:ring-2 focus-visible:ring-ring",
                isSelected
                  ? "border-signal/50 bg-signal/10 ring-1 ring-signal/40"
                  : "border-border/60 hover:ring-1 hover:ring-signal/40",
              )}
            >
              <RequirementStatusBadge status={status} />
              <span className="font-mono text-sm font-semibold tabular-nums">
                {count}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
