import type { Finding, Remediation } from "@/core/finding-types";
import type { Control } from "@/core/project-types";
import type { RemediationStatus } from "@/core/statuses";

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
