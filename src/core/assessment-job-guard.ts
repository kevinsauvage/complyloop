import type { AssessmentJob } from "./assessment-jobs";

/*
 * Client-safe guard for the assessment-jobs poll response. Hand-written instead
 * of using `assessmentJobsResponseSchema` so the live status island does not
 * pull `zod` into the client bundle.
 */

const PARSE_ERROR = "Could not refresh assessment job status.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Validates just enough of each job (id/status/trigger/projectId) for the poll
 * island; the API is internal so the remaining fields are trusted as typed.
 */
function isJobShape(value: unknown): value is AssessmentJob {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.projectId === "string" &&
    typeof value.status === "string" &&
    typeof value.trigger === "string" &&
    isRecord(value.payload)
  );
}

export function parseAssessmentJobsResponse(
  value: unknown,
): AssessmentJob[] {
  if (!isRecord(value) || !Array.isArray(value.jobs)) {
    throw new Error(PARSE_ERROR);
  }
  if (!value.jobs.every(isJobShape)) throw new Error(PARSE_ERROR);
  return value.jobs;
}
