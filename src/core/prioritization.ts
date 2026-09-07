import type { Control } from "@complyloop/analysis-core/contract/project-types";
import type { Severity } from "@complyloop/analysis-core/contract/statuses";
import type { Finding, FindingCluster } from "@complyloop/db/types";
import { lookupExhaustive } from "./assert-exhaustive";
import { clusterFindings } from "./root-cause";

/** Lower rank sorts first. Used to order findings by urgency. */
export function severityRank(severity: Severity): number {
  return lookupExhaustive(SEVERITY_RANK, severity, "severity");
}

const SEVERITY_RANK: Record<Severity, number> = {
  critical: 0,
  serious: 1,
  moderate: 2,
  minor: 3,
};

const CONFIDENCE_BONUS: Record<Finding["confidence"], number> = {
  high: 3,
  medium: 2,
  low: 1,
};

function controlWeight(
  finding: Finding,
  controls: ReadonlyArray<Control>,
): number {
  const control = controls.find((candidate) => candidate.id === finding.controlId);
  const weight = control?.complianceWeight ?? 1;
  return weight > 0 ? weight : 1;
}

/**
 * Higher score = fix sooner. Combines severity, confidence, cluster size,
 * and optional control complianceWeight (spec §16–17).
 */
function findingPriorityScore(
  finding: Finding,
  clusterSize: number,
  controls: ReadonlyArray<Control> = [],
): number {
  const severityScore = (4 - severityRank(finding.severity)) * 10;
  const confidenceScore = CONFIDENCE_BONUS[finding.confidence];
  const clusterBonus = Math.max(0, clusterSize - 1) * 4;
  const base = severityScore + confidenceScore + clusterBonus;
  return base * controlWeight(finding, controls);
}

export function prioritizeFindings(
  findings: ReadonlyArray<Finding>,
  controls: ReadonlyArray<Control>,
  clusters: ReadonlyArray<FindingCluster> = clusterFindings(findings, controls),
): Finding[] {
  const sizeByFinding = new Map<string, number>();
  for (const cluster of clusters) {
    for (const id of cluster.findingIds) {
      const previous = sizeByFinding.get(id) ?? 1;
      sizeByFinding.set(id, Math.max(previous, cluster.findingIds.length));
    }
  }

  return [...findings]
    .filter((finding) => finding.status === "open")
    .sort((a, b) => {
      const scoreA = findingPriorityScore(
        a,
        sizeByFinding.get(a.id) ?? 1,
        controls,
      );
      const scoreB = findingPriorityScore(
        b,
        sizeByFinding.get(b.id) ?? 1,
        controls,
      );
      if (scoreB !== scoreA) return scoreB - scoreA;
      return severityRank(a.severity) - severityRank(b.severity);
    });
}

/** Enriches clusters with occurrence counts and priority scores. */
export function prioritizeClusters(
  findings: ReadonlyArray<Finding>,
  controls: ReadonlyArray<Control>,
  clusters: ReadonlyArray<FindingCluster> = clusterFindings(findings, controls),
): FindingCluster[] {
  const byId = new Map(findings.map((finding) => [finding.id, finding]));

  return clusters
    .map((cluster) => {
      const members = cluster.findingIds
        .map((id) => byId.get(id))
        .filter((finding): finding is Finding => finding !== undefined);
      const priorityScore = members.reduce(
        (sum, finding) =>
          sum +
          findingPriorityScore(finding, cluster.findingIds.length, controls),
        0,
      );
      return {
        ...cluster,
        occurrenceCount: cluster.findingIds.length,
        priorityScore,
        label:
          cluster.findingIds.length >= 3
            ? `${cluster.findingIds.length} failures share one cause at \`${cluster.sharedLocation}\``
            : cluster.label,
      };
    })
    .sort((a, b) => (b.priorityScore ?? 0) - (a.priorityScore ?? 0));
}
