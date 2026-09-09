import { EvidenceKindBadge } from "@/components/badges";
import { FilterChipList } from "@/components/filter-chip-list";
import {
  EVIDENCE_KIND_FILTER_ORDER,
  evidenceKindHref,
} from "@/core/query";
import type { EvidenceKind } from "@complyloop/db/types";

export function EvidenceKindChips({
  counts,
  selected,
}: {
  counts: Map<EvidenceKind, number>;
  selected: EvidenceKind | undefined;
}) {
  const visibleKinds = EVIDENCE_KIND_FILTER_ORDER.filter(
    (kind) => (counts.get(kind) ?? 0) > 0,
  );
  if (visibleKinds.length === 0) return null;
  const hiddenKindCount = [...counts.entries()].filter(
    ([kind, count]) =>
      count > 0 &&
      !(EVIDENCE_KIND_FILTER_ORDER as readonly string[]).includes(kind),
  ).length;

  return (
    <div className="flex flex-col gap-2">
      <FilterChipList
        aria-label="Evidence kind filter"
        allHref={evidenceKindHref()}
        showAll
        allSelected={!selected}
        items={visibleKinds.map((kind) => {
          const isSelected = selected === kind;
          return {
            key: kind,
            href: isSelected ? evidenceKindHref() : evidenceKindHref(kind),
            selected: isSelected,
            label: <EvidenceKindBadge kind={kind} />,
            count: counts.get(kind) ?? 0,
          };
        })}
      />
      {hiddenKindCount > 0 ? (
        <p className="text-xs text-muted-foreground">
          Plus {hiddenKindCount} more event type
          {hiddenKindCount === 1 ? "" : "s"} grouped under these kinds.
        </p>
      ) : null}
    </div>
  );
}
