import Link from "next/link";

import type { RequirementStatus } from "@complyloop/analysis-core/contract/statuses";
import { REQUIREMENT_STATUS_DISPLAY_ORDER } from "@complyloop/analysis-core/contract/statuses";

import { RequirementStatusBadge } from "@/components/badges";
import { Card, CardContent } from "@/components/ui/card";
import { requirementStatusDisplay, STATUS_TONE_ACCENT } from "@/core/display";
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
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
      {REQUIREMENT_STATUS_DISPLAY_ORDER.map((status) => {
        const count = counts[status];

        const href = count > 0 ? requirementsStatusHref(status) : undefined;
        const share = total > 0 ? Math.round((count / total) * 100) : 0;
        const inner = (
          <CardContent className="relative flex flex-col gap-2 overflow-hidden p-4">
            <span
              className={cn(
                "absolute inset-y-3 left-0 w-1 rounded-full",
                STATUS_TONE_ACCENT[requirementStatusDisplay(status).tone],
              )}
              aria-hidden
            />
            <div className="flex items-baseline justify-between gap-2 pl-3">
              <p className="font-mono text-3xl font-semibold tracking-tight tabular-nums">
                {count}
              </p>
              {total > 0 ? (
                <span className="font-mono text-xs text-muted-foreground tabular-nums">
                  {share}%
                </span>
              ) : null}
            </div>
            <div className="pl-3">
              <RequirementStatusBadge status={status} />
            </div>
          </CardContent>
        );
        return (
          <Card
            key={status}
            size="sm"
            className={cn(
              "py-0 shadow-none transition-[background-color] duration-200",
              href && count > 0 && "hover:bg-accent/25",
            )}
          >
            {href && count > 0 ? (
              <Link
                href={href}
                className="block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {inner}
              </Link>
            ) : (
              inner
            )}
          </Card>
        );
      })}
    </div>
  );
}
