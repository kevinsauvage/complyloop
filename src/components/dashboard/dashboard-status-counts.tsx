import { RequirementStatusBadge } from "@/components/badges";
import { Card } from "@/components/ui";
import type { RequirementStatus } from "@/core/types";

const STATUS_ORDER: RequirementStatus[] = [
  "failed",
  "needs_review",
  "passed",
  "not_applicable",
  "unable_to_verify",
];

export function DashboardStatusCounts({
  counts,
}: {
  counts: Map<RequirementStatus, number>;
}) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
      {STATUS_ORDER.map((status) => (
        <Card key={status}>
          <p className="text-3xl font-semibold">{counts.get(status) ?? 0}</p>
          <div className="mt-2">
            <RequirementStatusBadge status={status} />
          </div>
        </Card>
      ))}
    </div>
  );
}
