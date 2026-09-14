import type {
  EvidenceRecord,
  Finding,
  Remediation,
} from "@complyloop/analysis-core/contract/entities";
import type { Requirement } from "@complyloop/analysis-core/contract/project-types";

/**
 * Installs an assessment run into an in-memory `WorkspaceSlice` for unit tests.
 * Production persists via `applyAssessmentPayload` instead.
 */
export function materializeAssessmentRun(
  db: {
    findings: Finding[];
    remediations: Remediation[];
    requirements: Requirement[];
    assessments: Array<{ id: string; projectId: string }>;
    evidence: EvidenceRecord[];
  },
  run: {
    assessment: { id: string; projectId: string };
    findings: Finding[];
    remediations: Remediation[];
    requirements: Requirement[];
    evidence: EvidenceRecord[];
  },
): void {
  const projectId = run.assessment.projectId;
  const previousFindingIds = new Set(
    db.findings
      .filter((finding) => finding.projectId === projectId)
      .map((finding) => finding.id),
  );

  db.findings = [
    ...db.findings.filter((finding) => finding.projectId !== projectId),
    ...run.findings,
  ];
  db.remediations = [
    ...db.remediations.filter(
      (remediation) => !previousFindingIds.has(remediation.findingId),
    ),
    ...run.remediations,
  ];
  db.requirements = [
    ...db.requirements.filter(
      (requirement) => requirement.projectId !== projectId,
    ),
    ...run.requirements,
  ];
  db.assessments = [
    ...db.assessments.filter(
      (assessment) => assessment.id !== run.assessment.id,
    ),
    run.assessment as (typeof db.assessments)[number],
  ];
  db.evidence.push(...run.evidence);
}
