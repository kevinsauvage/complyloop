import Link from "next/link";

import type { RequirementStatus } from "@complyloop/analysis-core/contract/statuses";
import { REQUIREMENT_STATUS_DISPLAY_ORDER } from "@complyloop/analysis-core/contract/statuses";

import { Card, CardContent } from "@/components/ui/card";
import { requirementStatusDisplay, STATUS_TONE_DOT } from "@/core/display";
import { requirementsStatusHref } from "@/core/filter-params";
import { cn } from "@/lib/utils";

export function DashboardStatusCounts({
  counts,
}: {
  counts: Record<RequirementStatus, number>;
}) {
  const total = REQUIREMENT_STATUS_DISPLAY_ORDER.reduce(
    (sum, status) => sum + counts[status],
    0,
  );

  return (
    <Card size="sm" className="py-0 shadow-none">
      <CardContent className="flex flex-col gap-4 p-4 sm:p-5">
        {total > 0 ? (
          <div
            className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-muted"
            role="img"
            aria-label={`${total} requirements in scope`}
          >
            {REQUIREMENT_STATUS_DISPLAY_ORDER.map((status) => {
              const count = counts[status];
              if (count === 0) return null;
              const tone = requirementStatusDisplay(status).tone;
              return (
                <span
                  key={status}
                  style={{ width: `${(count / total) * 100}%` }}
                  className={cn(
                    "h-full min-w-1 rounded-full",
                    STATUS_TONE_DOT[tone],
                  )}
                />
              );
            })}
          </div>
        ) : null}
        <ul
          aria-label="Requirement statuses"
          className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))] gap-x-4 gap-y-1"
        >
          {REQUIREMENT_STATUS_DISPLAY_ORDER.map((status) => {
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
                  )}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 text-sm font-medium text-foreground">
                  {display.label}
                </span>
                <span className="font-mono text-xl font-semibold tabular-nums tracking-tight">
                  {count}
                </span>
                {total > 0 ? (
                  <span className="w-9 shrink-0 text-right font-mono text-xs text-muted-foreground tabular-nums">
                    {share}%
                  </span>
                ) : null}
              </>
            );
            const rowClassName =
              "flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 py-2 outline-none transition-colors";
            return (
              <li key={status} className="min-w-0">
                {href ? (
                  <Link
                    href={href}
                    aria-label={`${display.label}: ${count} (${share}%). View requirements`}
                    className={cn(
                      rowClassName,
                      "hover:bg-accent/25 focus-visible:ring-2 focus-visible:ring-ring",
                    )}
                  >
                    {row}
                  </Link>
                ) : (
                  <span
                    aria-label={`${display.label}: ${count}`}
                    className={cn(rowClassName, "opacity-60")}
                  >
                    {row}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
