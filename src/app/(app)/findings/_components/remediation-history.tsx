import type {
  EvidenceRecord,
  Remediation,
} from "@complyloop/analysis-core/contract/entities";
import type { RemediationStatus } from "@complyloop/analysis-core/contract/statuses";

import { RemediationStatusBadge } from "@/components/primitives/badges";
import { FormattedDateTime } from "@/components/primitives/formatted-datetime";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

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
          <ol
            className="relative flex flex-col gap-0 border-l border-border/70 pl-4"
            aria-label="Remediation history timeline"
          >
            {history.map((entry, index) => (
              <li
                key={`${entry.at}-${index}`}
                className="relative pb-4 last:pb-0"
              >
                <span
                  aria-hidden
                  className={cn(
                    "absolute top-1.5 -left-[1.28125rem] size-2.5 rounded-full ring-4 ring-background",
                    index === 0 ? "bg-signal" : "bg-muted-foreground/40",
                  )}
                />
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <RemediationStatusBadge status={entry.status} />
                  {index === 0 ? (
                    <span className="rounded-full border border-signal/40 px-1.5 py-px text-xs font-semibold text-signal">
                      Latest
                    </span>
                  ) : null}
                  <FormattedDateTime
                    iso={entry.at}
                    className="text-xs text-muted-foreground"
                  />
                </div>
                {entry.note ? (
                  <p className="mt-1.5 text-sm text-muted-foreground">
                    {entry.note}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
