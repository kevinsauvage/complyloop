import { formatDateTime } from "@/components/page-primitives";
import type { Project } from "@/core/types";

export function projectDescription(
  project: Project,
  latestAssessment: { completedAt: string; filesScanned: number } | undefined,
): string {
  let sourceBit: string;
  switch (project.source) {
    case "github":
      sourceBit = project.github?.fullName ?? project.sourceRef ?? "GitHub repo";
      break;
    case "git":
      sourceBit = project.sourceRef ?? "git clone";
      break;
    case "local":
      sourceBit = project.rootPath;
      break;
    case "sample":
      sourceBit = "sample workspace";
      break;
    default: {
      const _exhaustive: never = project.source;
      throw new Error(`Unhandled project source: ${_exhaustive}`);
    }
  }
  if (!latestAssessment) {
    return `${sourceBit} · not assessed yet`;
  }
  return `${sourceBit} · assessed ${formatDateTime(latestAssessment.completedAt)} · ${latestAssessment.filesScanned} files`;
}
