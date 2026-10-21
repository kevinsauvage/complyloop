import Link from "next/link";

import type { AssessmentJobStatus } from "@complyloop/analysis-core/contract/assessment-jobs";
import type { RequirementStatus } from "@complyloop/analysis-core/contract/statuses";

import { StatusBadge } from "@/components/primitives/badges";
import { FormattedDateTime } from "@/components/primitives/formatted-datetime";
import { Button } from "@/components/ui/button";
import { requirementStatusDisplay } from "@/core/display/status";
import { PORTFOLIO_STATUS_COLUMNS, portfolioJobStatus } from "@/core/portfolio";
import { projectPath } from "@/core/routes";
import { cn } from "@/lib/utils";
import type { PortfolioRow } from "@/server/workspace/portfolio-view";

const JOB_LABEL: Record<AssessmentJobStatus, string> = {
  queued: "Queued",
  running: "Running",
  succeeded: "Complete",
  failed: "Failed",
  cancelled: "Cancelled",
};

const JOB_TONE: Record<
  AssessmentJobStatus,
  "passed" | "failed" | "signal" | "na"
> = {
  queued: "signal",
  running: "signal",
  succeeded: "passed",
  failed: "failed",
  cancelled: "na",
};

function countTone(status: RequirementStatus, value: number): string {
  if (value === 0) return "text-muted-foreground";
  if (status === "failed") return "font-semibold text-destructive";
  if (status === "needs_review") return "font-medium text-signal";
  return "text-foreground";
}

/**
 * One row per project: verdict counts, open violations, unread regressions,
 * last assessment and current job. The project cell is a form button so
 * "open" also switches the active project (a plain link cannot set the
 * cookie-backed selection).
 */
export function ProjectPortfolioTable({
  rows,
}: {
  rows: readonly PortfolioRow[];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">
          Compliance state for every project in this organization
        </caption>
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th scope="col" className="py-2 pr-3 font-medium">
              Project
            </th>
            {PORTFOLIO_STATUS_COLUMNS.map((status) => (
              <th
                key={status}
                scope="col"
                className="py-2 pr-3 text-right font-medium"
              >
                {requirementStatusDisplay(status).label}
              </th>
            ))}
            <th scope="col" className="py-2 pr-3 text-right font-medium">
              Open findings
            </th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">
              Unread regressions
            </th>
            <th scope="col" className="py-2 pr-3 font-medium">
              Last assessment
            </th>
            <th scope="col" className="py-2 pr-3 font-medium">
              Pipeline
            </th>
            <th scope="col" className="py-2 font-medium">
              <span className="sr-only">Open project</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const jobStatus = portfolioJobStatus(row);
            return (
              <tr key={row.project.id} className="border-b last:border-0">
                <th scope="row" className="py-2.5 pr-3 text-left font-medium">
                  <span className="block">{row.project.name}</span>
                  {row.project.github?.fullName ? (
                    <span className="block truncate text-xs font-normal text-muted-foreground">
                      {row.project.github.fullName}
                    </span>
                  ) : null}
                </th>
                {PORTFOLIO_STATUS_COLUMNS.map((status) => {
                  const value = row.requirements[status];
                  return (
                    <td
                      key={status}
                      className={cn(
                        "py-2.5 pr-3 text-right tabular-nums",
                        countTone(status, value),
                      )}
                    >
                      {value}
                    </td>
                  );
                })}
                <td
                  className={cn(
                    "py-2.5 pr-3 text-right tabular-nums",
                    row.openViolations > 0
                      ? "font-semibold text-destructive"
                      : "text-muted-foreground",
                  )}
                >
                  {row.openViolations}
                </td>
                <td
                  className={cn(
                    "py-2.5 pr-3 text-right tabular-nums",
                    row.unreadAlerts > 0
                      ? "font-medium text-signal"
                      : "text-muted-foreground",
                  )}
                >
                  {row.unreadAlerts}
                </td>
                <td className="py-2.5 pr-3 whitespace-nowrap text-muted-foreground">
                  {row.lastCompletedAt ? (
                    <FormattedDateTime iso={row.lastCompletedAt} />
                  ) : (
                    <span className="text-muted-foreground">
                      Never assessed
                    </span>
                  )}
                </td>
                <td className="py-2.5 pr-3 whitespace-nowrap">
                  {jobStatus ? (
                    <StatusBadge
                      label={JOB_LABEL[jobStatus] ?? jobStatus}
                      description={`Latest assessment job: ${jobStatus}`}
                      tone={JOB_TONE[jobStatus]}
                    />
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="py-2.5 text-right">
                  <Button
                    variant="outline"
                    size="sm"
                    asChild
                    // Visible label "Open" stays a contiguous prefix of the
                    // accessible name (WCAG 2.5.3); a trailing sr-only span
                    // would collapse to "OpenAcme Shop".
                    aria-label={`Open ${row.project.name}`}
                  >
                    <Link href={projectPath(row.project.id, "dashboard")}>
                      Open
                    </Link>
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
