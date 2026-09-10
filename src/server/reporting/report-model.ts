import "server-only";

import {
  controlDisplayCodes,
  secondaryReferenceLabel,
} from "@complyloop/analysis-core/adapters/control-theme";
import type {
  EvidenceRecord,
  Finding,
  Remediation,
} from "@complyloop/analysis-core/contract/entities";
import type { FindingLocation } from "@complyloop/analysis-core/contract/finding-types";
import { engineFor } from "@complyloop/analysis-core/contract/finding-types";
import {
  formatLocationRef,
  locationSnippet,
} from "@complyloop/analysis-core/contract/location";
import type {
  Control,
  Framework,
  Project,
  Requirement,
} from "@complyloop/analysis-core/contract/project-types";
import {
  FINDING_STATUSES,
  type FindingStatus,
  REQUIREMENT_STATUSES,
  type RequirementStatus,
  type Severity,
} from "@complyloop/analysis-core/contract/statuses";

import { countByStatus } from "@/core/assessment-helpers";
import {
  determinationDisplay,
  evidenceDisplay,
  remediationStatusDisplay,
  requirementStatusDisplay,
  severityDisplay,
} from "@/core/display";
import { prioritizeClusters } from "@/core/finding-priority";

export interface ReportInput {
  project: Project;
  framework: Framework;
  controls: Control[];
  requirements: Requirement[];
  findings: Finding[];
  remediations: Remediation[];
  evidence: EvidenceRecord[];
  /** Total evidence rows in the table (may exceed `evidence` when capped). */
  evidenceTotal: number;
  /** True when the loader capped `evidence` to the newest window. */
  evidenceTruncated: boolean;
  exportedAt: string;
}

export interface ReportHeaderModel {
  title: string;
  projectName: string;
  frameworkName: string;
  frameworkVersion: string;
  sourceKind: string;
  sourceRef?: string;
  githubFullName?: string;
  exportedAt: string;
}

/** Shared "kind — ref" label so HTML and markdown render the same source. */
export function projectSourceLabel(
  header: Pick<ReportHeaderModel, "sourceKind" | "sourceRef">,
): string {
  return `${header.sourceKind}${header.sourceRef ? ` — ${header.sourceRef}` : ""}`;
}

export interface EngineeringFindingCard {
  code: string;
  locationRef: string;
  /** Fenced-code language inferred from the location (tsx, ts, html, …). */
  language: string;
  requirementLine?: string;
  severity: string;
  severityClass: Severity;
  confidence: string;
  checkId: string;
  engine?: string;
  reason: string;
  snippet: string;
  remediationStatus?: string;
  suggestion?: {
    provenance: string;
    description: string;
    proposedSnippet: string;
  };
}

export interface EngineeringReportModel {
  header: ReportHeaderModel;
  clusters: {
    label: string;
    findingCount: number;
    checkId: string;
    sharedLocation: string;
  }[];
  findings: EngineeringFindingCard[];
}

export interface AuditRequirementRow {
  code: string;
  title: string;
  secondaryLabel: string;
  secondaryCode: string;
  status: RequirementStatus;
  statusLabel: string;
  determinationLabel: string;
  description: string;
  updatedAt: string;
  exception?: { reason: string; note: string; at: string };
}

export interface AuditEvidenceRow {
  at: string;
  kindLabel: string;
  summary: string;
}

export interface AuditReportModel {
  header: ReportHeaderModel;
  statusCounts: Record<RequirementStatus, number>;
  findingCounts: Record<FindingStatus, number>;
  totalRequirements: number;
  passRate: number;
  requirements: AuditRequirementRow[];
  evidence: AuditEvidenceRow[];
  evidenceTotal: number;
  evidenceTruncated: boolean;
}

function reportHeader(title: string, input: ReportInput): ReportHeaderModel {
  return {
    title,
    projectName: input.project.name,
    frameworkName: input.framework.name,
    frameworkVersion: input.framework.version,
    sourceKind: input.project.source,
    sourceRef: input.project.sourceRef,
    githubFullName: input.project.github?.fullName,
    exportedAt: input.exportedAt,
  };
}

function evidenceRowsForProject(
  evidence: EvidenceRecord[],
  projectId: string,
): AuditEvidenceRow[] {
  return evidence
    .filter((record) => record.projectId === projectId)
    .slice()
    .reverse()
    .map((record) => ({
      at: record.at,
      kindLabel: evidenceDisplay(record.kind, record.detail).label,
      summary: record.summary,
    }));
}

function indexBy<T, K extends string>(
  items: readonly T[],
  key: (item: T) => K,
): Map<K, T> {
  return new Map(items.map((item) => [key(item), item]));
}

/** Fenced-code hint for a finding snippet, from its file extension or DOM kind. */
function languageForLocation(location: FindingLocation): string {
  if (location.kind === "dom") return "html";
  if (location.kind !== "source") return "";
  const extension = location.filePath.split(".").pop()?.toLowerCase();
  switch (extension) {
    case "tsx":
      return "tsx";
    case "jsx":
      return "jsx";
    case "ts":
      return "ts";
    case "js":
      return "js";
    case "html":
    case "htm":
      return "html";
    case "vue":
      return "vue";
    case "svelte":
      return "svelte";
    case "css":
      return "css";
    default:
      return "";
  }
}

function toEngineeringFindingCard(
  finding: Finding,
  framework: Framework,
  controlById: ReadonlyMap<string, Control>,
  requirementByControlId: ReadonlyMap<string, Requirement>,
  remediationByFindingId: ReadonlyMap<string, Remediation>,
): EngineeringFindingCard {
  const control = controlById.get(finding.controlId);
  const requirement = requirementByControlId.get(finding.controlId);
  const remediation = remediationByFindingId.get(finding.id);
  const display = control
    ? controlDisplayCodes(control, framework.id)
    : undefined;

  return {
    code: display?.code ?? control?.code ?? finding.controlId,
    locationRef: formatLocationRef(finding.location),
    language: languageForLocation(finding.location),
    requirementLine: requirement
      ? `${requirementStatusDisplay(requirement.status).label} (${determinationDisplay(requirement.determination).label})`
      : undefined,
    severity: severityDisplay(finding.severity).label,
    severityClass: finding.severity,
    confidence: finding.confidence,
    checkId: finding.checkId,
    engine: engineFor(finding),
    reason: finding.reason,
    snippet: locationSnippet(finding.location),
    remediationStatus: remediation
      ? remediationStatusDisplay(remediation.status).label
      : undefined,
    suggestion: remediation?.suggestion
      ? {
          provenance: remediation.suggestion.provenance,
          description: remediation.suggestion.description,
          proposedSnippet: remediation.suggestion.proposedSnippet,
        }
      : undefined,
  };
}

function toAuditRequirementRow(
  control: Control,
  requirement: Requirement,
  framework: Framework,
): AuditRequirementRow {
  const display = controlDisplayCodes(control, framework.id);
  return {
    code: display.code,
    title: control.title,
    secondaryLabel: secondaryReferenceLabel(display.secondaryCode),
    secondaryCode: display.secondaryCode,
    status: requirement.status,
    statusLabel: requirementStatusDisplay(requirement.status).label,
    determinationLabel: determinationDisplay(requirement.determination).label,
    description: control.description,
    updatedAt: requirement.updatedAt,
    exception: requirement.exception
      ? {
          reason: requirement.exception.reason.replace(/_/g, " "),
          note: requirement.exception.note || "(no note)",
          at: requirement.exception.at,
        }
      : undefined,
  };
}

export function composeEngineeringReport(
  input: ReportInput,
): EngineeringReportModel {
  const { framework, controls, requirements, findings, remediations } = input;
  const openFindings = findings.filter((finding) => finding.status === "open");
  const controlById = indexBy(controls, (control) => control.id);
  const requirementByControlId = indexBy(
    requirements,
    (requirement) => requirement.controlId,
  );
  const remediationByFindingId = indexBy(
    remediations,
    (remediation) => remediation.findingId,
  );

  return {
    header: reportHeader("Engineering report", input),
    clusters: prioritizeClusters(openFindings, controls).map((cluster) => ({
      label: cluster.label,
      findingCount: cluster.findingIds.length,
      checkId: cluster.checkId,
      sharedLocation: cluster.sharedLocation,
    })),
    findings: openFindings.map((finding) =>
      toEngineeringFindingCard(
        finding,
        framework,
        controlById,
        requirementByControlId,
        remediationByFindingId,
      ),
    ),
  };
}

export function composeAuditReport(input: ReportInput): AuditReportModel {
  const { framework, controls, requirements, findings, evidence, project } =
    input;
  const statusCounts = countByStatus(requirements, REQUIREMENT_STATUSES);
  const totalRequirements = requirements.length;
  const requirementByControlId = indexBy(
    requirements,
    (requirement) => requirement.controlId,
  );

  return {
    header: reportHeader("Audit report", input),
    statusCounts,
    findingCounts: countByStatus(findings, FINDING_STATUSES),
    totalRequirements,
    passRate:
      totalRequirements > 0
        ? Math.round((statusCounts.passed / totalRequirements) * 100)
        : 0,
    requirements: controls.flatMap((control) => {
      const requirement = requirementByControlId.get(control.id);
      if (!requirement) return [];
      return [toAuditRequirementRow(control, requirement, framework)];
    }),
    evidence: evidenceRowsForProject(evidence, project.id),
    evidenceTotal: input.evidenceTotal,
    evidenceTruncated: input.evidenceTruncated,
  };
}
