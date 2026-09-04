import type { Remediation } from "@complyloop/analysis-core/contract/finding-types";

/** Default suggested remediation for server tests. */
export function testRemediation(partial: Partial<Remediation> = {}): Remediation {
  return {
    id: "r1",
    findingId: partial.findingId ?? "f1",
    status: "suggested",
    suggestion: {
      description: "Add alt",
      proposedSnippet: '<img src="x" alt="" />',
      provenance: "deterministic",
    },
    history: [],
    ...partial,
  };
}
