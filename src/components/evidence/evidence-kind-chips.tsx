import { EvidenceKindBadge } from "@/components/badges";
import { FilterChipList } from "@/components/filter-chip-list";
import {
  EVIDENCE_KIND_FILTER_ORDER,
  evidenceKindHref,
  type EvidencePageFilters,
} from "@/core/filters";
import type { EvidenceKind } from "@complyloop/db/types";

export function EvidenceKindChips({
  counts,
  selected,
  filters,
}: {
  counts: Map<EvidenceKind, number>;
  selected: EvidenceKind | undefined;
  /** Active text/date narrowing, preserved when switching kinds. */
  filters?: EvidencePageFilters;
}) {
  const visibleKinds = EVIDENCE_KIND_FILTER_ORDER.filter(
    (kind) => (counts.get(kind) ?? 0) > 0,
  );
  const hiddenKindCount = [...counts.entries()].filter(
    ([kind, count]) =>
      count > 0 &&
      !(EVIDENCE_KIND_FILTER_ORDER as readonly string[]).includes(kind),
  ).length;
  const zeroHidden = EVIDENCE_KIND_FILTER_ORDER.filter(
    (k) => (counts.get(k) ?? 0) === 0,
  ).length;
  const totalEvidence = [...counts.values()].reduce((a, b) => a + b, 0);

  return (
    <div className="flex flex-col gap-2">
      <FilterChipList
        aria-label="Evidence kind filter"
        allHref={evidenceKindHref(undefined, undefined, filters)}
        showAll
        allSelected={!selected}
        allCount={totalEvidence}
        items={visibleKinds.map((kind) => {
          const isSelected = selected === kind;
          return {
            key: kind,
            href: isSelected
              ? evidenceKindHref(undefined, undefined, filters)
              : evidenceKindHref(kind, undefined, filters),
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
      {zeroHidden > 0 ? (
        <p className="text-xs text-muted-foreground">
          No evidence entries in {zeroHidden} categor
          {zeroHidden === 1 ? "y" : "ies"} yet
        </p>
      ) : null}
    </div>
  );
}
