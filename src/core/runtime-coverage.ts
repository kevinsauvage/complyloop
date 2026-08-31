import type { AssessmentEngines } from "./finding-types";
import type { Project } from "./project-types";

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
