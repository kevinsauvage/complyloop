import { RequirementStatusBadge } from "@/components/badges";
import { FilterChipList } from "@/components/filter-chip-list";
import { requirementsPageHref } from "@/core/query";
import { REQUIREMENT_STATUS_DISPLAY_ORDER } from "@complyloop/analysis-core/contract/statuses";
import type { RequirementStatus } from "@complyloop/analysis-core/contract/statuses";

export function RequirementsStatusChips({
  counts,
  selected,
  presetId,
  defaultPresetId,
}: {
  counts: Record<RequirementStatus, number>;
  selected: RequirementStatus | undefined;
  presetId: string;
  defaultPresetId: string;
}) {
  const pageHref = (status?: RequirementStatus) =>
    requirementsPageHref({ presetId, status, defaultPresetId });

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
    <FilterChipList
      aria-label="Requirement status filter"
      allHref={pageHref()}
      showAll={Boolean(selected)}
      allSelected={false}
      items={items}
    />
  );
}
