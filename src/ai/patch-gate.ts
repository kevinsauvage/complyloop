import { type Finding } from "@complyloop/analysis-core/contract/entities";
import type { RawFinding } from "@complyloop/analysis-core/types";

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

/**
 * Passes when the patch removed the target and introduced nothing. A file can
 * hold several instances of the Finding's rule, and lines shift under an
 * edit, so the target counts as fixed when its rule-in-file count drops
 * (siblings may remain). New failures are counted as a multiset: a second
 * copy of an existing failure is new too.
 */
export function complyLoopGate(
  finding: Finding,
  baseline: ReadonlyArray<RawFinding>,
  after: ReadonlyArray<RawFinding>,
): ComplyLoopGateResult {
  const target = findingIdentity(finding);
  const isTarget = (candidate: RawFinding) =>
    findingIdentity(candidate) === target;
  const targetBefore = baseline.filter(isTarget).length;
  const targetAfter = after.filter(isTarget);
  const targetFixed =
    targetAfter.length === 0 ||
    (target !== null && targetAfter.length < targetBefore);

  const unmatchedBaseline = new Map<string, number>();
  for (const candidate of baseline) {
    const key = findingFingerprint(candidate);
    unmatchedBaseline.set(key, (unmatchedBaseline.get(key) ?? 0) + 1);
  }
  const newFindings = after.filter((candidate) => {
    const key = findingFingerprint(candidate);
    const left = unmatchedBaseline.get(key) ?? 0;
    if (left === 0) return true;
    unmatchedBaseline.set(key, left - 1);
    return false;
  });

  const remaining = [
    ...(targetFixed ? [] : targetAfter.map((candidate) => candidate.checkId)),
    ...newFindings.map((candidate) => candidate.checkId),
  ];
  return { passed: remaining.length === 0, remaining };
}
