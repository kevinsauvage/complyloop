import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export interface TimelineItem {
  id: string;
  badge: ReactNode;
  date: ReactNode;
  /** Defaults to the first item; drives the highlight dot + Latest pill. */
  isLatest?: boolean;
  children?: ReactNode;
}

/**
 * Single timeline renderer for audit-trail lists (finding evidence trail,
 * remediation history): bordered rail, highlight dot, Latest pill, date row.
 * Callers map their entries to items and keep their own wrappers (cards,
 * empty states, show-more disclosure) — only the repeated row markup lives
 * here.
 */
export function EvidenceTimeline({
  items,
  label,
}: {
  items: readonly TimelineItem[];
  label: string;
}) {
  return (
    <ol
      className="relative flex flex-col gap-0 border-l border-border/70 pl-4"
      aria-label={label}
    >
      {items.map((item, index) => {
        const latest = item.isLatest ?? index === 0;
        return (
          <li key={item.id} className="relative pb-4 last:pb-0">
            <span
              aria-hidden
              className={cn(
                "absolute top-1.5 -left-[1.28125rem] size-2.5 rounded-full ring-4 ring-background",
                latest ? "bg-signal" : "bg-muted-foreground/40",
              )}
            />
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              {item.badge}
              {latest ? (
                <span className="rounded-full border border-signal/40 px-1.5 py-px text-xs font-semibold text-signal">
                  Latest
                </span>
              ) : null}
              {item.date}
            </div>
            {item.children}
          </li>
        );
      })}
    </ol>
  );
}
