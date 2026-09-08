import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function filterChipClass(selected: boolean): string {
  return cn(
    "surface-panel flex items-center gap-2 rounded-xl px-2.5 py-1.5 outline-none transition-[border-color,background-color] duration-200",
    "hover:bg-card/90 focus-visible:ring-2 focus-visible:ring-ring",
    selected
      ? "border-signal/40 bg-signal/10 ring-1 ring-signal/30"
      : "hover:border-signal/25",
  );
}

export function FilterChipList({
  "aria-label": ariaLabel,
  allHref,
  showAll,
  allSelected,
  items,
}: {
  "aria-label": string;
  allHref: string;
  /** When false, hide the All chip (requirements page when nothing selected). */
  showAll: boolean;
  allSelected: boolean;
  items: Array<{
    key: string;
    href: string;
    selected: boolean;
    label: ReactNode;
    count: number;
  }>;
}) {
  return (
    <ul className="mb-6 flex flex-wrap gap-2" aria-label={ariaLabel}>
      {showAll ? (
        <li>
          <Link
            href={allHref}
            aria-current={allSelected ? "true" : undefined}
            className={filterChipClass(allSelected)}
          >
            All
          </Link>
        </li>
      ) : null}
      {items.map((item) => (
        <li key={item.key}>
          <Link
            href={item.href}
            aria-current={item.selected ? "true" : undefined}
            className={filterChipClass(item.selected)}
          >
            {item.label}
            <span className="font-mono text-sm font-semibold tabular-nums">
              {item.count}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
