import {
  ASSESSMENT_JOB_STATUSES,
  ASSESSMENT_JOB_TRIGGERS,
} from "@complyloop/analysis-core/contract/assessment-jobs";

import type { AssessmentJob } from "./assessment-jobs";

/*
 * Client-safe guard for the assessment-jobs poll response. Hand-written instead
 * of using `assessmentJobsResponseSchema` so the live status island does not
 * pull `zod` into the client bundle — but anchored to the same contract enums
 * (dependency-free), so a new status/trigger cannot silently slip through.
 */

const PARSE_ERROR = "Could not refresh assessment job status.";

const JOB_STATUSES: ReadonlyArray<string> = ASSESSMENT_JOB_STATUSES;
const JOB_TRIGGERS: ReadonlyArray<string> = ASSESSMENT_JOB_TRIGGERS;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Validates just enough of each job (id/projectId/status/trigger/payload) for
 * the poll island; the API is internal so the remaining fields are trusted as
 * typed. Status/trigger must be known contract values — not merely strings.
 */
function isJobShape(value: unknown): value is AssessmentJob {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.projectId === "string" &&
    typeof value.status === "string" &&
    JOB_STATUSES.includes(value.status) &&
    typeof value.trigger === "string" &&
    JOB_TRIGGERS.includes(value.trigger) &&
    isRecord(value.payload)
  );
}

export function parseAssessmentJobsResponse(value: unknown): AssessmentJob[] {
  if (!isRecord(value) || !Array.isArray(value.jobs)) {
    throw new Error(PARSE_ERROR);
  }
  if (!value.jobs.every(isJobShape)) throw new Error(PARSE_ERROR);
  return value.jobs;
}
