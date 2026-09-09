import { REMEDIATION_STATUSES } from "@complyloop/analysis-core/contract/statuses";
import type { RemediationStatus } from "@complyloop/analysis-core/contract/statuses";
import { remediationStatusDisplay } from "@/core/status-display";
import { cn } from "@/lib/utils";

/**
 * Maps the remediation axis (`Detected → Suggested → Approved → Implemented →
 * Verified`) onto the finding: only `Verified` closes the loop. Steps before
 * the current one are done, the current one is marked with `aria-current`.
 */
export function RemediationStepper({
  status,
}: {
  status: RemediationStatus;
}) {
  const currentIndex = REMEDIATION_STATUSES.indexOf(status);
  const stepLabel = `${currentIndex + 1} of ${REMEDIATION_STATUSES.length}`;

  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">
        Remediation step {stepLabel} — only Verified closes the finding
      </p>
      <ol
        aria-label="Remediation progress"
        className="mt-2 flex flex-wrap items-center gap-1.5"
      >
        {REMEDIATION_STATUSES.map((step, index) => {
          const state =
            index < currentIndex
              ? "done"
              : index === currentIndex
                ? "current"
                : "upcoming";
          return (
            <li key={step} className="flex items-center gap-1.5">
              {index > 0 ? (
                <span aria-hidden className="text-muted-foreground">
                  →
                </span>
              ) : null}
              <span
                aria-current={state === "current" ? "step" : undefined}
                title={remediationStatusDisplay(step).description}
                className={cn(
                  "rounded-full border px-2 py-0.5 text-xs font-medium",
                  state === "done" &&
                    "border-status-passed/40 bg-status-passed/10 text-status-passed",
                  state === "current" &&
                    "border-signal/50 bg-signal/10 text-signal",
                  state === "upcoming" &&
                    "border-border/70 text-muted-foreground",
                )}
              >
                {remediationStatusDisplay(step).label}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
