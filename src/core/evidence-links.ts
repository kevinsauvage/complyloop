import type { EvidenceRecord } from "@complyloop/analysis-core/contract/finding-types";
import type { Requirement } from "@complyloop/analysis-core/contract/project-types";
import { requirementsStatusHref } from "./requirement-status-filter";

/** Primary navigation target for an evidence row in the compliance loop. */
export function evidenceRecordHref(
  record: EvidenceRecord,
  requirements: readonly Requirement[],
): string | undefined {
  if (record.findingId) {
    return `/findings/${record.findingId}`;
  }
  if (record.controlId) {
    const requirement = requirements.find(
      (candidate) => candidate.controlId === record.controlId,
    );
    return requirementsStatusHref(requirement?.status);
  }
  if (record.assessmentId) {
    return "/";
  }
  return undefined;
}
