import type { AssessmentJobStatus } from "@complyloop/analysis-core/contract/assessment-jobs";
import { ASSESSMENT_JOB_STATUSES } from "@complyloop/analysis-core/contract/assessment-jobs";
import { isOneOf } from "@complyloop/analysis-core/contract/literal-sets";
import type { RequirementStatus } from "@complyloop/analysis-core/contract/statuses";

/**
 * Portfolio display policy — shared by the server loader and the table
 * component, so it must stay free of server/db imports (the component renders
 * in the browser bundle).
 */

/** Requirement statuses the portfolio table shows, in verdict order. */
export const PORTFOLIO_STATUS_COLUMNS: ReadonlyArray<RequirementStatus> = [
  "failed",
  "needs_review",
  "unable_to_verify",
  "passed",
  "not_applicable",
];

/**
 * Newest job status as the queue's own enum, or null when the project has
 * never run one (or the row carries a status this build does not know —
 * unknown, never mislabelled).
 */
export function portfolioJobStatus(row: {
  latestJobStatus: string | null;
}): AssessmentJobStatus | null {
  const status = row.latestJobStatus;
  return isOneOf(ASSESSMENT_JOB_STATUSES, status) ? status : null;
}

/** The row fields the overview summary and filters read. */
export interface PortfolioSignals {
  attention: number;
  openViolations: number;
  unreadAlerts: number;
  lastCompletedAt: string | null;
  latestJobStatus: string | null;
}

export const PORTFOLIO_FILTERS = ["attention", "never", "pipeline"] as const;
export type PortfolioFilter = (typeof PORTFOLIO_FILTERS)[number];

export const PORTFOLIO_FILTER_LABEL: Record<PortfolioFilter, string> = {
  attention: "Needs attention",
  never: "Never assessed",
  pipeline: "Pipeline failed",
};

/** Query-string value → filter, or null for "all" (unknown values too). */
export function parsePortfolioFilter(
  raw: string | string[] | undefined,
): PortfolioFilter | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return (PORTFOLIO_FILTERS as readonly (string | undefined)[]).includes(value)
    ? (value as PortfolioFilter)
    : null;
}

export function matchesPortfolioFilter(
  row: PortfolioSignals,
  filter: PortfolioFilter,
): boolean {
  switch (filter) {
    case "attention":
      return row.attention > 0 || row.openViolations > 0;
    case "never":
      return row.lastCompletedAt === null;
    case "pipeline":
      return portfolioJobStatus(row) === "failed";
  }
}

export interface PortfolioSummary {
  projects: number;
  openViolations: number;
  unreadAlerts: number;
  /** Projects per filter — doubles as the filter chips' counts. */
  byFilter: Record<PortfolioFilter, number>;
}

export function summarizePortfolio(
  rows: readonly PortfolioSignals[],
): PortfolioSummary {
  const byFilter: Record<PortfolioFilter, number> = {
    attention: 0,
    never: 0,
    pipeline: 0,
  };
  let openViolations = 0;
  let unreadAlerts = 0;
  for (const row of rows) {
    openViolations += row.openViolations;
    unreadAlerts += row.unreadAlerts;
    for (const filter of PORTFOLIO_FILTERS) {
      if (matchesPortfolioFilter(row, filter)) byFilter[filter] += 1;
    }
  }
  return { projects: rows.length, openViolations, unreadAlerts, byFilter };
}
