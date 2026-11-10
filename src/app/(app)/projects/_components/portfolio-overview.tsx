import type { Route } from "next";
import Link from "next/link";

import {
  LedgerFact,
  LedgerStrip,
} from "@/components/primitives/page-primitives";
import {
  PORTFOLIO_FILTER_LABEL,
  PORTFOLIO_FILTERS,
  type PortfolioFilter,
  type PortfolioSummary,
} from "@/core/portfolio";
import { cn } from "@/lib/utils";

function Metric({
  label,
  value,
  alarming = false,
}: {
  label: string;
  value: number;
  /** A non-zero value is a failure state (Failed Red), not just a count. */
  alarming?: boolean;
}) {
  return (
    <LedgerFact
      label={label}
      valueClassName={cn(
        "font-mono text-2xl font-semibold tabular-nums tracking-tight",
        value === 0 && "text-muted-foreground",
        value > 0 && alarming && "text-status-failed",
      )}
    >
      {value}
    </LedgerFact>
  );
}

/** Organization-wide totals across every visible project, as a Ledger Strip. */
export function PortfolioSummaryTiles({
  summary,
}: {
  summary: PortfolioSummary;
}) {
  return (
    <LedgerStrip
      framed
      label="Portfolio totals"
      className="grid-cols-2 sm:grid-cols-2 lg:grid-cols-4"
    >
      <Metric
        label="Projects needing attention"
        value={summary.byFilter.attention}
        alarming
      />
      <Metric label="Open findings" value={summary.openViolations} alarming />
      <Metric
        label="Unread regressions"
        value={summary.unreadAlerts}
        alarming
      />
      <Metric label="Never assessed" value={summary.byFilter.never} />
    </LedgerStrip>
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
