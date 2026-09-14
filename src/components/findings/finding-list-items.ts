import type {
  Finding,
  Remediation,
} from "@complyloop/analysis-core/contract/entities";
import type { RemediationSuggestion } from "@complyloop/analysis-core/contract/finding-types";
import type { Control } from "@complyloop/analysis-core/contract/project-types";
import type { RemediationStatus } from "@complyloop/analysis-core/contract/statuses";

export type FindingListItem = {
  finding: Finding;
  control: Control;
  remediationStatus: RemediationStatus;
  /** Carried so bulk-approve gating can allow deterministic source fixes. */
  suggestion: RemediationSuggestion | null;
};

export function toFindingListItems(
  findings: Finding[],
  getControl: (controlId: string) => Control,
  getRemediation: (findingId: string) => Remediation,
): FindingListItem[] {
  return findings.map((finding) => {
    const remediation = getRemediation(finding.id);
    return {
      finding,
      control: getControl(finding.controlId),
      remediationStatus: remediation.status,
      suggestion: remediation.suggestion,
    };
  });
}
