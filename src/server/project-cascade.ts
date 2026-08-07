import type { Db } from "./db";

/**
 * Removes mutable project-scoped records. Evidence is append-only and left
 * for audit history. Does not remove the project row itself.
 */
export function removeProjectScopedRecords(db: Db, projectId: string): void {
  const findingIds = new Set(
    db.findings
      .filter((finding) => finding.projectId === projectId)
      .map((finding) => finding.id),
  );

  db.requirements = db.requirements.filter(
    (requirement) => requirement.projectId !== projectId,
  );
  db.assessments = db.assessments.filter(
    (assessment) => assessment.projectId !== projectId,
  );
  db.findings = db.findings.filter(
    (finding) => finding.projectId !== projectId,
  );
  db.remediations = db.remediations.filter(
    (remediation) => !findingIds.has(remediation.findingId),
  );
  db.alerts = db.alerts.filter((alert) => alert.projectId !== projectId);
}
