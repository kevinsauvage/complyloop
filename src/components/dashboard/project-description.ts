import type { Project } from "@complyloop/analysis-core/contract/project-types";

/** Stable, locale-free source label — safe to render in SSR strings. */
export function projectSourceBit(project: Project): string {
  return project.github?.fullName ?? project.sourceRef ?? "GitHub repo";
}
