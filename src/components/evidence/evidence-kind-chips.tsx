import Link from "next/link";
import { EvidenceKindBadge } from "@/components/badges";
import {
  EVIDENCE_KIND_FILTER_ORDER,
  evidenceKindHref,
} from "@/core/query";
import type { EvidenceKind } from "@complyloop/db/types";
import { cn } from "@/lib/utils";

const filterChipClass = (selected: boolean) =>
  cn(
    "surface-panel flex items-center rounded-xl px-2.5 py-1.5 text-sm font-medium outline-none transition-[border-color,background-color] duration-200",
    "hover:bg-card/90 focus-visible:ring-2 focus-visible:ring-ring",
    selected
      ? "border-signal/40 bg-signal/10 ring-1 ring-signal/30"
      : "hover:border-signal/25",
  );

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
    <ul
      className="mb-6 flex flex-wrap gap-2"
      aria-label="Evidence kind filter"
    >
      <li>
        <Link
          href={evidenceKindHref()}
          aria-current={selected ? undefined : "true"}
          className={filterChipClass(!selected)}
        >
          All
        </Link>
      </li>
      {visibleKinds.map((kind) => {
        const isSelected = selected === kind;
        const count = counts.get(kind) ?? 0;
        return (
          <li key={kind}>
            <Link
              href={isSelected ? evidenceKindHref() : evidenceKindHref(kind)}
              aria-current={isSelected ? "true" : undefined}
              className={cn(filterChipClass(isSelected), "gap-2")}
            >
              <EvidenceKindBadge kind={kind} />
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
