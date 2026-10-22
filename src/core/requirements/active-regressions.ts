import type {
  EvidenceRecord,
  Requirement,
} from "@complyloop/analysis-core/contract/entities";

/**
 * Compliance regressions worth showing now: the newest `limit` regression
 * records whose requirement is still in the worse state it regressed to.
 * A later assessment that recovers the requirement leaves the record in the
 * evidence log (history) but takes it off the dashboard.
 */
export function activeRegressions(
  evidence: readonly EvidenceRecord[],
  requirements: readonly Pick<Requirement, "controlId" | "status">[],
  projectId: string,
  limit = 3,
): EvidenceRecord[] {
  const currentStatus = new Map(
    requirements.map((requirement) => [
      requirement.controlId,
      requirement.status,
    ]),
  );
  return evidence
    .filter(
      (record) =>
        record.projectId === projectId &&
        record.kind === "requirement_status_changed" &&
        record.detail?.regression === true &&
        (!record.controlId ||
          currentStatus.get(record.controlId) === record.detail?.to),
    )
    .slice(-limit)
    .reverse();
}
