import { RemediationStatusBadge } from "@/components/badges";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Remediation } from "@complyloop/analysis-core/contract/finding-types";
import { formatDateTime } from "@/core/format-datetime";
import { cn } from "@/lib/utils";

/**
 * Visualizes the `RemediationHistoryEntry` timeline on a finding so teams can
 * see who approved / implemented / verified what, and when. Rendered newest
 * first (history is appended oldest → newest by the domain model).
 */
export function RemediationHistory({
  remediation,
}: {
  remediation: Remediation;
}) {
  const history = [...remediation.history].reverse();

  return (
    <Card className="shadow-none" id="remediation-history">
      <CardHeader className="gap-1">
        <CardTitle>
          <h2 className="text-base font-medium">Remediation history</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {history.length === 0 ? (
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>No remediation steps recorded yet.</span>
            <span className="flex items-center gap-2">
              Current status:
              <RemediationStatusBadge status={remediation.status} />
            </span>
          </div>
        ) : (
          <ol
            className="relative flex flex-col gap-0 border-l border-border/70 pl-4"
            aria-label="Remediation history timeline"
          >
            {history.map((entry, index) => (
              <li key={`${entry.at}-${index}`} className="relative pb-4 last:pb-0">
                <span
                  aria-hidden
                  className={cn(
                    "absolute top-1.5 -left-[1.28125rem] size-2.5 rounded-full ring-4 ring-background",
                    index === 0 ? "bg-signal" : "bg-muted-foreground/40",
                  )}
                />
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <RemediationStatusBadge status={entry.status} />
                  <time
                    dateTime={entry.at}
                    className="text-xs text-muted-foreground"
                  >
                    {formatDateTime(entry.at)}
                  </time>
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