import type { Project } from "@complyloop/analysis-core/contract/project-types";

import { formatDateTime } from "@/core/datetime";

export function projectDescription(
  project: Project,
  latestAssessment: { completedAt: string; filesScanned: number } | undefined,
): string {
  const sourceBit =
    project.github?.fullName ?? project.sourceRef ?? "GitHub repo";
  if (!latestAssessment) {
    return `${sourceBit} · not assessed yet`;
  }
  return `${sourceBit} · assessed ${formatDateTime(latestAssessment.completedAt)} · ${latestAssessment.filesScanned} files`;
}
