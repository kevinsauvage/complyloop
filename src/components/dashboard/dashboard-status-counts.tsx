import Link from "next/link";
import { RequirementStatusBadge } from "@/components/badges";
import { Card, CardContent } from "@/components/ui/card";
import { requirementsStatusHref } from "@/core/requirement-status-filter";
import { cn } from "@/lib/utils";
import type { RequirementStatus } from "@/core/statuses";
import { REQUIREMENT_STATUS_DISPLAY_ORDER } from "@/core/statuses";

const STATUS_ACCENT: Record<RequirementStatus, string> = {
  failed: "bg-status-failed",
  needs_review: "bg-status-review",
  passed: "bg-status-passed",
  not_applicable: "bg-status-na",
  unable_to_verify: "bg-status-unverifiable",
};

export function DashboardStatusCounts({
  counts,
}: {
  counts: Map<RequirementStatus, number>;
}) {
  const total = REQUIREMENT_STATUS_DISPLAY_ORDER.reduce(
    (sum, status) => sum + (counts.get(status) ?? 0),
    0,
  );

  return (
    <div className="flex flex-col gap-4">
      {total > 0 ? (
        <div
          className="flex h-2 overflow-hidden rounded-full bg-muted"
          role="img"
          aria-label={`Requirement status mix across ${total} requirements`}
        >
          {REQUIREMENT_STATUS_DISPLAY_ORDER.map((status) => {
            const count = counts.get(status) ?? 0;
            if (count === 0) return null;
            const pct = (count / total) * 100;
            return (
              <div
                key={status}
                className={cn("h-full transition-[width]", STATUS_ACCENT[status])}
                style={{ width: `${pct}%` }}
                title={`${status}: ${count}`}
              />
            );
          })}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {REQUIREMENT_STATUS_DISPLAY_ORDER.map((status) => {
          const count = counts.get(status) ?? 0;
          const href = count > 0 ? requirementsStatusHref(status) : undefined;
          const share = total > 0 ? Math.round((count / total) * 100) : 0;
          const inner = (
            <CardContent className="relative flex flex-col gap-3 overflow-hidden p-4">
              <span
                className={cn(
                  "absolute inset-y-0 left-0 w-1",
                  STATUS_ACCENT[status],
                )}
                aria-hidden
              />
              <div className="flex items-baseline justify-between gap-2 pl-2">
                <p className="font-mono text-3xl font-semibold tracking-tight tabular-nums">
                  {count}
                </p>
                {total > 0 ? (
                  <span className="font-mono text-xs text-muted-foreground tabular-nums">
                    {share}%
                  </span>
                ) : null}
              </div>
              <div className="pl-2">
                <RequirementStatusBadge status={status} />
              </div>
              {total > 0 ? (
                <div
                  className="mt-auto h-1 overflow-hidden rounded-full bg-muted pl-0"
                  aria-hidden
                >
                  <div
                    className={cn("h-full rounded-full", STATUS_ACCENT[status])}
                    style={{ width: `${share}%` }}
                  />
                </div>
              ) : null}
            </CardContent>
          );
          return (
            <Card
              key={status}
              size="sm"
              className={cn(
                "py-0 shadow-none ring-1 ring-border/60",
                count === 0 && "opacity-60",
                href &&
                  count > 0 &&
                  "transition-[background-color,box-shadow] hover:bg-accent/40 hover:ring-signal/40",
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
    </div>
  );
}
