import type { Assessment } from "@complyloop/analysis-core/contract/entities";
import type { AssessmentEngines } from "@complyloop/analysis-core/contract/finding-types";
import type { Project } from "@complyloop/analysis-core/contract/project-types";

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

  return {
    mode: "source_and_preview",
    label: `Source + preview${pagePart}`,
    pagesScanned,
    runtimeError,
  };
}

/** Zero-init every status key, then count items by `status`. */
export function countByStatus<T extends string>(
  items: readonly { status: T }[],
  statuses: readonly T[],
): Record<T, number> {
  const counts = Object.fromEntries(
    statuses.map((status) => [status, 0]),
  ) as Record<T, number>;
  for (const item of items) {
    counts[item.status] += 1;
  }
  return counts;
}

/** Count items by a derived string key, returning a Map for O(1) lookups. */
export function toCountMap<T>(
  items: readonly T[],
  key: (item: T) => string,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const k = key(item);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return counts;
}
