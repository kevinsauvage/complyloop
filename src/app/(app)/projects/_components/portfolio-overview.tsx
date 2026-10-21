import type { Route } from "next";
import Link from "next/link";

import {
  PORTFOLIO_FILTER_LABEL,
  PORTFOLIO_FILTERS,
  type PortfolioFilter,
  type PortfolioSummary,
} from "@/core/portfolio";
import { cn } from "@/lib/utils";

function Tile({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "danger" | "signal";
}) {
  return (
    <div className="surface-panel rounded-xl px-4 py-3">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "mt-1 text-2xl font-semibold tabular-nums",
          value === 0 && "text-muted-foreground",
          value > 0 && tone === "danger" && "text-destructive",
          value > 0 && tone === "signal" && "text-signal",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

/** Organization-wide totals across every visible project. */
export function PortfolioSummaryTiles({
  summary,
}: {
  summary: PortfolioSummary;
}) {
  return (
    <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Tile
        label="Projects needing attention"
        value={summary.byFilter.attention}
        tone="danger"
      />
      <Tile
        label="Open findings"
        value={summary.openViolations}
        tone="danger"
      />
      <Tile
        label="Unread regressions"
        value={summary.unreadAlerts}
        tone="signal"
      />
      <Tile label="Never assessed" value={summary.byFilter.never} />
    </dl>
  );
}

/** Server-rendered filter chips: the filter lives in the URL, so it is shareable. */
export function PortfolioFilterChips({
  summary,
  active,
}: {
  summary: PortfolioSummary;
  active: PortfolioFilter | null;
}) {
  const chips: Array<{
    key: PortfolioFilter | "all";
    label: string;
    count: number;
    href: string;
  }> = [
    { key: "all", label: "All", count: summary.projects, href: "/projects" },
    ...PORTFOLIO_FILTERS.map((filter) => ({
      key: filter,
      label: PORTFOLIO_FILTER_LABEL[filter],
      count: summary.byFilter[filter],
      href: `/projects?filter=${filter}`,
    })),
  ];
  return (
    <nav aria-label="Filter projects" className="mb-3">
      <ul className="flex flex-wrap gap-2">
        {chips.map((chip) => {
          const current = (active ?? "all") === chip.key;
          return (
            <li key={chip.key}>
              <Link
                href={chip.href as Route}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors",
                  current
                    ? "border-signal/40 bg-signal/10 font-medium text-foreground"
                    : "border-border/60 text-muted-foreground hover:bg-accent/40 hover:text-foreground",
                )}
              >
                {chip.label}
                <span className="tabular-nums text-xs text-muted-foreground">
                  {chip.count}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
