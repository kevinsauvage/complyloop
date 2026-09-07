import type { Assessment } from "@complyloop/db/types";
import type { AssessmentEngines } from "@complyloop/analysis-core/contract/finding-types";
import type { Project } from "@complyloop/analysis-core/contract/project-types";

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
  const hasPreviewUrl = Boolean(project.runtimeBaseUrl?.trim());
  const runtimeError = engines?.runtimeError ?? null;
  const pagesScanned =
    engines?.runtime && typeof engines.runtimePagesScanned === "number"
      ? engines.runtimePagesScanned
      : null;

  if (!hasPreviewUrl) {
    return {
      mode: "source_only",
      label: "Source only",
      pagesScanned: null,
      runtimeError: null,
    };
  }

  const pagePart =
    pagesScanned !== null ? ` (${pagesScanned} page${pagesScanned === 1 ? "" : "s"})` : "";

  return {
    mode: "source_and_preview",
    label: `Source + preview${pagePart}`,
    pagesScanned,
    runtimeError,
  };
}
