import type { Project } from "@complyloop/analysis-core/contract/project-types";

/** Stable, locale-free source label — safe to render in SSR strings. */
export function projectSourceBit(project: Project): string {
  return project.github?.fullName ?? project.sourceRef ?? "GitHub repo";
}

/**
 * @deprecated Locale date strings differ between server (UTC) and browser
 * (viewer TZ) and throw React hydration #418. Compose the header with
 * `projectSourceBit` + `<FormattedDateTime>` instead (see dashboard page).
 */
export function projectDescription(
  project: Project,
  latestAssessment: { completedAt: string; filesScanned: number } | undefined,
): string {
  const sourceBit = projectSourceBit(project);
  if (!latestAssessment) {
    return `${sourceBit} · not assessed yet`;
  }
  // Deterministic ISO — never a locale string. The dashboard page renders the
  // human date via <FormattedDateTime> instead of this value.
  return `${sourceBit} · assessed ${latestAssessment.completedAt} · ${latestAssessment.filesScanned} files`;
}
