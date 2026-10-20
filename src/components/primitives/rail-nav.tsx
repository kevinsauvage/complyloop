import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export interface RailNavItem {
  key: string;
  href: string;
  label: ReactNode;
  count: number;
  /** Unit read after the count by screen readers, e.g. "controls". */
  countLabel?: string;
  current: boolean;
}

/**
 * One group of filter links: a lateral list on wide screens and a horizontal
 * strip on narrow ones. Same links either way — only the layout changes.
 */
export function RailNavGroup({
  "aria-label": ariaLabel,
  heading,
  items,
  wrap = false,
}: {
  "aria-label": string;
  /** Visual-only caption above the group (wide screens). */
  heading: string;
  items: readonly RailNavItem[];
  /** Let long labels wrap onto several lines instead of staying on one. */
  wrap?: boolean;
}) {
  return (
    <nav aria-label={ariaLabel}>
      <p
        aria-hidden
        className="mb-2 hidden px-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase lg:block"
      >
        {heading}
      </p>
      <ul className="surface-panel flex gap-1 overflow-x-auto rounded-xl p-1 lg:flex-col lg:overflow-visible lg:border-0 lg:bg-transparent lg:p-0">
        {items.map((item) => (
          <li key={item.key} className="max-lg:shrink-0 max-lg:flex-1">
            <Link
              href={item.href as Route}
              aria-current={item.current ? "page" : undefined}
              className={cn(
                "relative flex min-h-10 items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                wrap
                  ? "lg:whitespace-normal max-lg:whitespace-nowrap"
                  : "whitespace-nowrap",
                item.current
                  ? "bg-sidebar-accent text-foreground shadow-sm ring-1 ring-border lg:shadow-none lg:ring-0"
                  : "text-muted-foreground hover:bg-accent/40 hover:text-foreground",
              )}
            >
              {item.current ? (
                <span
                  className="absolute inset-y-1.5 left-0 hidden w-0.5 rounded-full bg-signal lg:block"
                  aria-hidden
                />
              ) : null}
              <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                {item.label}
              </span>
              {/* Whitespace keeps the accessible name "Open 3", not "Open3". */}{" "}
              <span
                className={cn(
                  "min-w-6 shrink-0 rounded-full px-1.5 py-0.5 text-center font-mono text-xs tabular-nums",
                  item.current
                    ? "bg-signal/15 text-signal"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {item.count}
                {item.countLabel ? (
                  <span className="sr-only"> {item.countLabel}</span>
                ) : null}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * A single group in a sticky rail, so the filter stays one click away while
 * scrolling a long list. Pair it with a two-column grid:
 * `lg:grid-cols-[13rem_minmax(0,1fr)]`.
 */
export function RailNav({
  footer,
  ...group
}: React.ComponentProps<typeof RailNavGroup> & { footer?: ReactNode }) {
  return (
    <div className="lg:sticky lg:top-6">
      <RailNavGroup {...group} />
      {footer ? <div className="mt-3 px-3">{footer}</div> : null}
    </div>
  );
}
