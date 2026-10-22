import type { Assessment } from "@complyloop/analysis-core/contract/entities";
import type { AssessmentEngines } from "@complyloop/analysis-core/contract/finding-types";
import { zeroCounts } from "@complyloop/analysis-core/contract/literal-sets";
import type { Project } from "@complyloop/analysis-core/contract/project-types";
import {
  REQUIREMENT_STATUSES,
  type RequirementStatus,
} from "@complyloop/analysis-core/contract/statuses";

/**
 * Assessment summary helpers: latest-assessment lookup, preview-coverage
 * summary, and generic status counting. Safe for the worker/assessment
 * pipeline — no finding-page UX imports.
 */

/** Latest completed assessment for a project, independent of array order. */
export function latestAssessmentFor(
  assessments: ReadonlyArray<Assessment>,
  projectId: string,
): Assessment | undefined {
  let latest: Assessment | undefined;
  for (const assessment of assessments) {
    if (assessment.projectId !== projectId) continue;
    if (
      !latest ||
      assessment.completedAt > latest.completedAt ||
      (assessment.completedAt === latest.completedAt &&
        assessment.startedAt > latest.startedAt)
    ) {
      latest = assessment;
    }
  }
  return latest;
}

export type RuntimeCoverageMode = "source_only" | "source_and_preview";

/** Single predicate for "preview URL configured" (blank/whitespace = absent). */
export function hasPreviewUrl(
  project: Pick<Project, "runtimeBaseUrl">,
): boolean {
  return Boolean(project.runtimeBaseUrl?.trim());
}

export interface RuntimeCoverageSummary {
  mode: RuntimeCoverageMode;
  label: string;
  pagesScanned: number | null;
  runtimeError: string | null;
}

export function runtimeCoverageSummary(
  project: Pick<Project, "runtimeBaseUrl">,
  engines?: AssessmentEngines,
): RuntimeCoverageSummary {
  const hasPreviewUrlValue = hasPreviewUrl(project);
  const runtimeError = engines?.runtimeError ?? null;
  const pagesScanned =
    engines?.runtime && typeof engines.runtimePagesScanned === "number"
      ? engines.runtimePagesScanned
      : null;

  if (!hasPreviewUrlValue) {
    return {
      mode: "source_only",
      label: "Source only",
      pagesScanned: null,
      runtimeError: null,
    };
  }

  const pagePart =
    pagesScanned !== null
      ? ` (${pagesScanned} page${pagesScanned === 1 ? "" : "s"})`
      : "";

  // `runtimeTied` is absent on assessments from before commit tying; only an
  // explicit `false` is labelled, so history is not relabelled retroactively.
  const untiedPart =
    engines?.runtime && engines.runtimeTied === false
      ? " — not tied to a commit"
      : "";

  return {
    mode: "source_and_preview",
    label: `Source + preview${pagePart}${untiedPart}`,
    pagesScanned,
    runtimeError,
  };
}

export function countByStatus<T extends string>(
  items: readonly { status: T }[],
  statuses: readonly T[],
): Record<T, number> {
  const counts = zeroCounts(statuses);
  for (const item of items) {
    counts[item.status] += 1;
  }
  return counts;
}

/**
 * Share of applicable requirements that passed, as a whole percent; null
 * when none apply. `not_applicable` stays out of the denominator, like the
 * RGAA conformity rate: a criterion that does not apply is neither met nor
 * missed.
 */
export function passRatePercent(
  counts: Partial<Record<RequirementStatus, number>>,
): number | null {
  const applicable = REQUIREMENT_STATUSES.filter(
    (status) => status !== "not_applicable",
  ).reduce((sum, status) => sum + (counts[status] ?? 0), 0);
  if (applicable === 0) return null;
  return Math.round(((counts.passed ?? 0) / applicable) * 100);
}
