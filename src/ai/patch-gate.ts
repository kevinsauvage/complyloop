import type { RawFinding } from "@complyloop/analysis-core/types";
import { type Finding } from "@complyloop/analysis-core/contract/entities";
import type { ComplyLoopGateResult } from "./patch-types";

function findingIdentity(finding: {
  checkId: string;
  location: RawFinding["location"] | Finding["location"];
}): string | null {
  if (finding.location.kind !== "source") return null;
  return `${finding.checkId}\0${finding.location.filePath}`;
}

function findingFingerprint(finding: RawFinding): string {
  const identity = findingIdentity(finding);
  return `${identity ?? finding.checkId}\0${finding.reason}`;
}

export function complyLoopGate(
  finding: Finding,
  baseline: ReadonlyArray<RawFinding>,
  after: ReadonlyArray<RawFinding>,
): ComplyLoopGateResult {
  const target = findingIdentity(finding);
  const remaining = after
    .filter((candidate) => findingIdentity(candidate) === target)
    .map((candidate) => candidate.checkId);
  const baselineKeys = new Set(baseline.map(findingFingerprint));
  const newFindings = after.filter(
    (candidate) => !baselineKeys.has(findingFingerprint(candidate)),
  );
  const passed = remaining.length === 0 && newFindings.length === 0;
  return {
    passed,
    remaining: [
      ...remaining,
      ...newFindings.map((candidate) => candidate.checkId),
    ],
  };
}
