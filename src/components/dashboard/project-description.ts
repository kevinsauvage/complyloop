import { formatDateTime } from "@/components/page-primitives";
import type { Project } from "@/core/project-types";

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
