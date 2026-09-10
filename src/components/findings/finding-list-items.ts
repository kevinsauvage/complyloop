import type {
  Finding,
  Remediation,
} from "@complyloop/analysis-core/contract/entities";
import type { Control } from "@complyloop/analysis-core/contract/project-types";
import type { RemediationStatus } from "@complyloop/analysis-core/contract/statuses";

export type FindingListItem = {
  finding: Finding;
  control: Control;
  remediationStatus: RemediationStatus;
};

export function toFindingListItems(
  findings: Finding[],
  getControl: (controlId: string) => Control,
  getRemediation: (findingId: string) => Remediation,
): FindingListItem[] {
  return findings.map((finding) => ({
    finding,
    control: getControl(finding.controlId),
    remediationStatus: getRemediation(finding.id).status,
  }));
}
