import Link from "next/link";

import type { RequirementStatus } from "@complyloop/analysis-core/contract/statuses";
import { REQUIREMENT_STATUS_DISPLAY_ORDER } from "@complyloop/analysis-core/contract/statuses";

import { requirementStatusDisplay, STATUS_TONE_DOT } from "@/core/display";
import { requirementsStatusHref } from "@/core/filter-params";
import { cn } from "@/lib/utils";

/**
 * Attention-first order for the dashboard. The shared
 * `REQUIREMENT_STATUS_DISPLAY_ORDER` stays the canonical list (filters,
 * reports); here the statuses that need a decision come before the healthy
 * ones. `unable_to_verify` moves up because it is the largest actionable gap
 * on a fresh project and used to sit last, reading as an afterthought.
 */
const DASHBOARD_STATUS_ORDER: RequirementStatus[] = [
  "failed",
  "needs_review",
  "unable_to_verify",
  "passed",
  "not_applicable",
];

export function DashboardStatusCounts({
  counts,
  className,
}: {
  counts: Record<RequirementStatus, number>;
  className?: string;
}) {
  const total = REQUIREMENT_STATUS_DISPLAY_ORDER.reduce(
    (sum, status) => sum + counts[status],
    0,
  );
  const breakdown = DASHBOARD_STATUS_ORDER.filter(
    (status) => counts[status] > 0,
  )
    .map(
      (status) =>
        `${counts[status]} ${requirementStatusDisplay(status).label.toLowerCase()}`,
    )
    .join(", ");

  return (
    <div
      className={cn("flex h-full flex-col justify-between gap-4", className)}
    >
      <div>
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <p className="text-sm font-medium">Status distribution</p>
          <p className="font-mono text-xs tabular-nums text-muted-foreground">
            {total} requirement{total === 1 ? "" : "s"} in scope
          </p>
        </div>
        {total > 0 ? (
          <div
            className="mt-2 flex h-2 w-full gap-0.5 overflow-hidden rounded-full bg-muted"
            role="img"
            aria-label={`${total} requirements in scope: ${breakdown}`}
          >
            {DASHBOARD_STATUS_ORDER.map((status) => {
              const count = counts[status];
              if (count === 0) return null;
              const tone = requirementStatusDisplay(status).tone;
              return (
                <span
                  key={status}
                  style={{ width: `${(count / total) * 100}%` }}
                  className={cn(
                    "h-full min-w-1 first:rounded-l-full last:rounded-r-full",
                    STATUS_TONE_DOT[tone],
                  )}
                />
              );
            })}
          </div>
        ) : (
          <div className="mt-2 h-2 w-full rounded-full bg-muted" aria-hidden />
        )}
      </div>
      <ul
        aria-label="Requirement statuses"
        className="grid grid-cols-1 gap-x-4 gap-y-0.5 sm:grid-cols-2"
      >
        {DASHBOARD_STATUS_ORDER.map((status) => {
          const count = counts[status];
          const href = count > 0 ? requirementsStatusHref(status) : undefined;
          const share = total > 0 ? Math.round((count / total) * 100) : 0;
          const display = requirementStatusDisplay(status);
          // Plain dot + label instead of RequirementStatusBadge: the badge
          // carries a cursor-help tooltip + sr-only description that fights
          // the row link (wrong affordance, heavy DOM). Full context stays
          // in the row's accessible name.
          const row = (
            <>
              <span
                className={cn(
                  "size-2 shrink-0 rounded-full",
                  STATUS_TONE_DOT[display.tone],
                  // Dim the mark, never the text: a zero count is real data
                  // and must stay at full contrast.
                  count === 0 && "opacity-40",
                )}
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                {display.label}
              </span>
              <span
                className={cn(
                  "font-mono text-sm font-semibold tabular-nums",
                  count === 0 && "text-muted-foreground",
                )}
              >
                {count}
              </span>
              <span className="w-9 shrink-0 text-right font-mono text-xs text-muted-foreground tabular-nums">
                {total > 0 ? `${share}%` : "—"}
              </span>
            </>
          );
          const rowClassName =
            "flex min-w-0 flex-1 items-center gap-2.5 rounded-md px-2 py-2 outline-none transition-colors";
          return (
            <li key={status} className="min-w-0">
              {href ? (
                <Link
                  href={href}
                  className={cn(
                    rowClassName,
                    "hover:bg-accent/25 focus-visible:ring-2 focus-visible:ring-ring",
                  )}
                >
                  {row}
                  <span className="sr-only">View requirements</span>
                </Link>
              ) : (
                <span className={rowClassName}>{row}</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
