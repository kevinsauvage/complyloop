import type {
  EvidenceRecord,
  Remediation,
} from "@complyloop/analysis-core/contract/entities";
import type { RemediationStatus } from "@complyloop/analysis-core/contract/statuses";

import { RemediationStatusBadge } from "@/components/primitives/badges";
import { EvidenceTimeline } from "@/components/primitives/evidence-timeline";
import { FormattedDateTime } from "@/components/primitives/formatted-datetime";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type HistoryEntry = {
  status: RemediationStatus;
  at: string;
  note?: string;
};

/**
 * Remediation lifecycle kinds that belong on the timeline, mapped to the
 * status they record. `remediation_verification_failed` changes nothing, so
 * it renders under the remediation's current status.
 */
const HISTORY_STATUS_BY_KIND: Record<string, RemediationStatus | "current"> = {
  remediation_suggested: "suggested",
  ai_remediation_suggested: "suggested",
  ai_patch_ready: "suggested",
  remediation_approved: "approved",
  remediation_implemented: "implemented",
  remediation_verified: "verified",
  remediation_manually_verified: "verified",
  remediation_verification_failed: "current",
};

function stringField(detail: unknown, key: string): string | undefined {
  if (typeof detail !== "object" || detail === null) return undefined;
  const value = (detail as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

function historyEntriesFor(
  remediation: Remediation,
  evidence: readonly EvidenceRecord[],
): HistoryEntry[] {
  // `evidence` arrives newest-first (`listEvidenceForFinding` orders by
  // `at` desc), matching the newest-first timeline below.
  const entries: HistoryEntry[] = [];
  for (const record of evidence) {
    const mapped = HISTORY_STATUS_BY_KIND[record.kind];
    if (mapped === undefined) continue;
    entries.push({
      status: mapped === "current" ? remediation.status : mapped,
      at: record.at,
      note:
        stringField(record.detail, "note") ??
        stringField(record.detail, "description"),
    });
  }
  return entries;
}

/**
 * Visualizes the remediation timeline on a finding so teams can see who
 * approved / implemented / verified what, and when. Derived from the
 * finding's evidence (the append-only audit trail) — `Remediation.history`
 * is legacy write data for old rows only. Rendered newest first.
 */
export function RemediationHistory({
  remediation,
  evidence,
}: {
  remediation: Remediation;
  evidence: readonly EvidenceRecord[];
}) {
  const history = historyEntriesFor(remediation, evidence);

  return (
    <Card className="shadow-none" id="remediation-history">
      <CardHeader className="gap-1">
        <CardTitle className="text-base font-medium">
          Remediation history
        </CardTitle>
        {history.length > 0 ? (
          <p className="text-xs text-muted-foreground">Newest first</p>
        ) : null}
      </CardHeader>
      <CardContent>
        {history.length === 0 ? (
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>No remediation steps recorded yet.</span>
            <span className="flex items-center gap-2">
              Current status:
              <RemediationStatusBadge status={remediation.status} />
            </span>
            <span className="basis-full text-xs">
              Generate guidance or approve a suggestion from the panel above to
              start the trail.
            </span>
          </div>
        ) : (
          <EvidenceTimeline
            label="Remediation history timeline"
            items={history.map((entry, index) => ({
              id: `${entry.at}-${index}`,
              badge: <RemediationStatusBadge status={entry.status} />,
              date: (
                <FormattedDateTime
                  iso={entry.at}
                  className="text-xs text-muted-foreground"
                />
              ),
              children: entry.note ? (
                <p className="mt-1.5 text-sm text-muted-foreground">
                  {entry.note}
                </p>
              ) : null,
            }))}
          />
        )}
      </CardContent>
    </Card>
  );
}
