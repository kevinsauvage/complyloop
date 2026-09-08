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

  return (
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
  );
}
