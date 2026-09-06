import type { Assessment } from "@complyloop/db/types";

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
