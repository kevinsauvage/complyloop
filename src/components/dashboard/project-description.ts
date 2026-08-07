import { formatDateTime } from "@/components/ui";
import type { Project } from "@/core/types";

export function projectDescription(
  project: Project,
  latestAssessment: { completedAt: string; filesScanned: number } | undefined,
  orgName?: string,
): string {
  let sourceBit: string;
  switch (project.source) {
    case "github":
      sourceBit = `GitHub ${project.github?.fullName ?? project.sourceRef ?? "repo"}`;
      break;
    case "git":
      sourceBit = `cloned from ${project.sourceRef ?? "git"}`;
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
  const assessmentBit = latestAssessment
    ? `last assessed ${formatDateTime(latestAssessment.completedAt)}, ${latestAssessment.filesScanned} files scanned`
    : "not assessed yet";
  const orgBit = orgName ? ` · org ${orgName}` : "";
  return `Project "${project.name}" (${sourceBit}${orgBit}) — ${assessmentBit}`;
}
