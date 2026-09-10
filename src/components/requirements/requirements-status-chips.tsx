import { RequirementStatusBadge } from "@/components/badges";
import { FilterChipList } from "@/components/filter-chip-list";
import { requirementsPageHref } from "@/core/filters";
import { REQUIREMENT_STATUS_DISPLAY_ORDER } from "@complyloop/analysis-core/contract/statuses";
import type { RequirementStatus } from "@complyloop/analysis-core/contract/statuses";

export function RequirementsStatusChips({
  counts,
  selected,
  presetId,
  defaultPresetId,
  q,
}: {
  counts: Record<RequirementStatus, number>;
  selected: RequirementStatus | undefined;
  presetId: string;
  defaultPresetId: string;
  q?: string;
}) {
  const pageHref = (status?: RequirementStatus) =>
    requirementsPageHref({ presetId, status, q, defaultPresetId });

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const hiddenCount = REQUIREMENT_STATUS_DISPLAY_ORDER.filter(
    (s) => (counts[s] ?? 0) === 0,
  ).length;

  const items = REQUIREMENT_STATUS_DISPLAY_ORDER.flatMap((status) => {
    const count = counts[status];
    if (count === 0) return [];
    const isSelected = selected === status;
    return [
      {
        key: status,
        href: isSelected ? pageHref() : pageHref(status),
        selected: isSelected,
        label: <RequirementStatusBadge status={status} />,
        count,
      },
    ];
  });

  return (
    <div className="flex flex-col gap-1">
      <FilterChipList
        aria-label="Requirement status filter"
        allHref={pageHref()}
        showAll
        allSelected={!selected}
        allCount={total}
        items={items}
      />
      {hiddenCount > 0 ? (
        <p className="text-xs text-muted-foreground">
          No requirement entries in {hiddenCount} categor
          {hiddenCount === 1 ? "y" : "ies"} yet
        </p>
      ) : null}
    </div>
  );
}
