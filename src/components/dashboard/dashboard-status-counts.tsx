import Link from "next/link";
import { RequirementStatusBadge } from "@/components/badges";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { RequirementStatus } from "@/core/types";

const STATUS_ORDER: RequirementStatus[] = [
  "failed",
  "needs_review",
  "passed",
  "not_applicable",
  "unable_to_verify",
];

const STATUS_HREF: Partial<Record<RequirementStatus, string>> = {
  failed: "/requirements",
  needs_review: "/requirements",
  passed: "/requirements",
};

export function DashboardStatusCounts({
  counts,
}: {
  counts: Map<RequirementStatus, number>;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {STATUS_ORDER.map((status) => {
        const count = counts.get(status) ?? 0;
        const href = STATUS_HREF[status];
        const inner = (
          <CardContent className="flex flex-col gap-2 p-4">
            <p className="text-3xl font-semibold tracking-tight tabular-nums">
              {count}
            </p>
            <RequirementStatusBadge status={status} />
          </CardContent>
        );
        return (
          <Card
            key={status}
            size="sm"
            className={cn(
              "py-0 shadow-none",
              href && "transition-colors hover:bg-muted/40",
            )}
          >
            {href ? (
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
