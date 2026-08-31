import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  EVIDENCE_KIND_FILTER_ORDER,
  evidenceKindHref,
} from "@/core/evidence-kind-filter";
import type { EvidenceKind } from "@/core/finding-types";
import { evidenceKindLabel } from "@/core/labels";
import { cn } from "@/lib/utils";

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
          className={cn(
            "flex items-center rounded-lg border bg-card/60 px-2.5 py-1.5 text-sm font-medium",
            "outline-none transition-colors hover:bg-accent/40",
            "focus-visible:ring-2 focus-visible:ring-ring",
            selected
              ? "border-border/60 hover:ring-1 hover:ring-signal/40"
              : "border-signal/50 bg-signal/10 ring-1 ring-signal/40",
          )}
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
              className={cn(
                "flex items-center gap-2 rounded-lg border bg-card/60 px-2.5 py-1.5",
                "outline-none transition-colors hover:bg-accent/40",
                "focus-visible:ring-2 focus-visible:ring-ring",
                isSelected
                  ? "border-signal/50 bg-signal/10 ring-1 ring-signal/40"
                  : "border-border/60 hover:ring-1 hover:ring-signal/40",
              )}
            >
              <Badge variant="secondary" className="font-normal text-xs">
                {evidenceKindLabel(kind)}
              </Badge>
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
