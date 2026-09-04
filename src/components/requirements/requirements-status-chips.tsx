import Link from "next/link";
import { RequirementStatusBadge } from "@/components/badges";
import { requirementsPageHref } from "@/core/requirements-page";
import { REQUIREMENT_STATUS_DISPLAY_ORDER } from "@complyloop/analysis-core/contract/statuses";
import { cn } from "@/lib/utils";
import type { RequirementStatus } from "@complyloop/analysis-core/contract/statuses";

const filterChipClass = (selected: boolean) =>
  cn(
    "surface-panel flex items-center gap-2 rounded-xl px-2.5 py-1.5 outline-none transition-[border-color,background-color] duration-200",
    "hover:bg-card/90 focus-visible:ring-2 focus-visible:ring-ring",
    selected
      ? "border-signal/40 bg-signal/10 ring-1 ring-signal/30"
      : "hover:border-signal/25",
  );

export function RequirementsStatusChips({
  counts,
  selected,
  presetId,
  defaultPresetId,
}: {
  counts: Map<RequirementStatus, number>;
  selected: RequirementStatus | undefined;
  presetId: string;
  defaultPresetId: string;
}) {
  const pageHref = (status?: RequirementStatus) =>
    requirementsPageHref({ presetId, status, defaultPresetId });

  return (
    <ul
      className="mb-6 flex flex-wrap gap-2"
      aria-label="Requirement status filter"
    >
      {selected ? (
        <li>
          <Link href={pageHref()} className={filterChipClass(false)}>
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
              href={isSelected ? pageHref() : pageHref(status)}
              aria-current={isSelected ? "true" : undefined}
              className={filterChipClass(isSelected)}
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
