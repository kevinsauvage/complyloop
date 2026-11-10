/**
 * "Copy summary" on the dashboard: a short Markdown status update to paste
 * into Slack, a standup note, or a PR comment. Plain text built from what the
 * dashboard already loaded — no extra queries, nothing persisted.
 */
import "server-only";

import type {
  Assessment,
  Finding,
} from "@complyloop/analysis-core/contract/entities";
import { formatLocationRef } from "@complyloop/analysis-core/contract/location";
import type {
  Control,
  Project,
} from "@complyloop/analysis-core/contract/project-types";
import {
  REQUIREMENT_STATUSES,
  type RequirementStatus,
} from "@complyloop/analysis-core/contract/statuses";

import { passRatePercent } from "@/core/assessment/assessment-helpers";
import { formatDateTimeWithZone } from "@/core/datetime";
import { requirementStatusDisplay } from "@/core/display/status";
import { effectiveBranch } from "@/server/github/tracked-branch";

/** How many open findings the summary names before "and N more". */
export const SUMMARY_TOP_FINDINGS = 5;

export type StatusSummaryInput = {
  project: Pick<Project, "name" | "github">;
  latestAssessment: Pick<Assessment, "completedAt" | "filesScanned">;
  counts: Record<RequirementStatus, number>;
  /** Oldest → newest pass rates from assessment history. */
  trend: ReadonlyArray<{ passRate: number }>;
  openCount: number;
  regressionCount: number;
  /** Severity-sorted open findings (only the first few are listed). */
  topFindings: ReadonlyArray<{
    finding: Pick<Finding, "id" | "severity" | "location">;
    control: Pick<Control, "code" | "title">;
  }>;
  /** Absolute app origin, e.g. `https://complyloop.vercel.app`. */
  origin: string;
};

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function passRateLine(
  counts: StatusSummaryInput["counts"],
  trend: StatusSummaryInput["trend"],
): string {
  const rate = passRatePercent(counts);
  if (rate === null) return "- Pass rate: —";
  // The newest trend point is this assessment; compare the shown (current)
  // rate with the run before it so the delta matches the number on screen.
  const previous = trend.length >= 2 ? trend[trend.length - 2] : undefined;
  if (!previous) return `- Pass rate: **${rate}%**`;
  const delta = rate - previous.passRate;
  const change =
    delta === 0
      ? "unchanged since the previous run"
      : `${delta > 0 ? "▲" : "▼"} ${Math.abs(delta)} pts since the previous run`;
  return `- Pass rate: **${rate}%** (${change})`;
}

export function statusSummary(input: StatusSummaryInput): string {
  const { project, latestAssessment, counts, origin } = input;
  const branch = project.github ? effectiveBranch(project.github) : undefined;
  const title = project.github?.fullName ?? project.name;
  const requirementParts = REQUIREMENT_STATUSES.filter(
    (status) => counts[status] > 0,
  ).map(
    (status) =>
      `${counts[status]} ${requirementStatusDisplay(status).label.toLowerCase()}`,
  );

  const lines = [
    `**Accessibility status — ${title}**${branch ? ` (\`${branch}\`)` : ""}`,
    `Assessed ${formatDateTimeWithZone(latestAssessment.completedAt, "UTC")} · ${plural(latestAssessment.filesScanned, "file")}`,
    "",
    passRateLine(counts, input.trend),
    `- Requirements: ${requirementParts.length > 0 ? requirementParts.join(" · ") : "none assessed"}`,
    `- Open findings: ${input.openCount}`,
    ...(input.regressionCount > 0
      ? [`- Regressions: ${input.regressionCount}`]
      : []),
  ];

  const top = input.topFindings.slice(0, SUMMARY_TOP_FINDINGS);
  if (top.length > 0) {
    lines.push("", "Top open findings:");
    top.forEach(({ finding, control }, index) => {
      lines.push(
        `${index + 1}. [${finding.severity}] ${control.code} — ${control.title} · \`${formatLocationRef(finding.location)}\` — ${origin}/findings/${finding.id}`,
      );
    });
    const more = input.openCount - top.length;
    if (more > 0) lines.push(`…and ${plural(more, "more open finding")}.`);
  }

  lines.push("", `Dashboard: ${origin}/dashboard`);
  return `${lines.join("\n")}\n`;
}
