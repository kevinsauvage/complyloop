import type { RequirementStatus } from "@complyloop/analysis-core/contract/statuses";
import { REQUIREMENT_STATUS_DISPLAY_ORDER } from "@complyloop/analysis-core/contract/statuses";

import { RequirementStatusBadge } from "@/components/primitives/badges";
import { RailNavGroup } from "@/components/primitives/rail-nav";
import { requirementsPageHref } from "@/core/filter-params/requirements";

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
        label: <RequirementStatusBadge status={status} />,
        count,
        current: isSelected,
      },
    ];
  });

  return (
    <div className="flex flex-col gap-2">
      <RailNavGroup
        aria-label="Requirement status filter"
        heading="Status"
        items={[
          {
            key: "all",
            href: pageHref(),
            label: "All",
            count: total,
            current: !selected,
          },
          ...items,
        ]}
      />
      {hiddenCount > 0 ? (
        <p className="px-3 text-xs text-muted-foreground">
          No requirements in {hiddenCount}{" "}
          {hiddenCount === 1 ? "status" : "statuses"} yet
        </p>
      ) : null}
    </div>
  );
}
