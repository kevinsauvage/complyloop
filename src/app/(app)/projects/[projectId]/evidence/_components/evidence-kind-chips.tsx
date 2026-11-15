import type { EvidenceKind } from "@complyloop/analysis-core/contract/entities";
import { isOneOf } from "@complyloop/analysis-core/contract/literal-sets";

import { EvidenceKindBadge } from "@/components/primitives/badges";
import { HiddenCategoriesNote } from "@/components/primitives/filter-chip-list";
import { RailNav } from "@/components/primitives/rail-nav";
import {
  EVIDENCE_KIND_FILTER_ORDER,
  evidenceKindHref,
  type EvidencePageFilters,
} from "@/core/filter-params/evidence";

export function EvidenceKindChips({
  projectId,
  counts,
  selected,
  filters,
}: {
  projectId: string;
  counts: Map<EvidenceKind, number>;
  selected: EvidenceKind | undefined;
  /** Active text/date narrowing, preserved when switching kinds. */
  filters?: EvidencePageFilters;
}) {
  const visibleKinds = EVIDENCE_KIND_FILTER_ORDER.filter(
    (kind) => (counts.get(kind) ?? 0) > 0,
  );
  const hiddenKindCount = [...counts.entries()].filter(
    ([kind, count]) => count > 0 && !isOneOf(EVIDENCE_KIND_FILTER_ORDER, kind),
  ).length;
  const zeroHidden = EVIDENCE_KIND_FILTER_ORDER.filter(
    (k) => (counts.get(k) ?? 0) === 0,
  ).length;
  const totalEvidence = [...counts.values()].reduce((a, b) => a + b, 0);

  const allHref = evidenceKindHref(projectId, undefined, undefined, filters);

  return (
    <RailNav
      aria-label="Evidence kind filter"
      heading="Type"
      items={[
        {
          key: "all",
          href: allHref,
          label: "All",
          count: totalEvidence,
          current: !selected,
        },
        ...visibleKinds.map((kind) => ({
          key: kind,
          // Selecting the current kind again clears it, as the chips did.
          href:
            selected === kind
              ? allHref
              : evidenceKindHref(projectId, kind, undefined, filters),
          label: <EvidenceKindBadge kind={kind} />,
          count: counts.get(kind) ?? 0,
          current: selected === kind,
        })),
      ]}
      footer={
        hiddenKindCount > 0 || zeroHidden > 0 ? (
          <div className="flex flex-col gap-2">
            {hiddenKindCount > 0 ? (
              <p className="text-xs text-muted-foreground">
                Plus {hiddenKindCount} more event type
                {hiddenKindCount === 1 ? "" : "s"} grouped under these kinds.
              </p>
            ) : null}
            {zeroHidden > 0 ? (
              <HiddenCategoriesNote count={zeroHidden} noun="evidence" />
            ) : null}
          </div>
        ) : null
      }
    />
  );
}
