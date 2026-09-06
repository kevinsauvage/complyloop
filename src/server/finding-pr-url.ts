import type { EvidenceRecord } from "@complyloop/db/types";

export function pullRequestUrlFromEvidence(
  evidence: ReadonlyArray<Pick<EvidenceRecord, "kind" | "detail">>,
): string | null {
  for (let index = evidence.length - 1; index >= 0; index -= 1) {
    const record = evidence[index];
    if (record?.kind !== "pull_request_prepared") continue;
    const prUrl = record.detail?.prUrl;
    if (typeof prUrl === "string" && prUrl.length > 0) {
      return prUrl;
    }
  }
  return null;
}
