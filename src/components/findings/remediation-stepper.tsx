import { useId } from "react";
import { Check } from "lucide-react";
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
  const descriptionId = useId();
  const currentDisplay = remediationStatusDisplay(
    REMEDIATION_STATUSES[currentIndex] ?? "detected",
  );

  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">
        Step {currentIndex + 1} of {REMEDIATION_STATUSES.length}:{" "}
        {currentDisplay.label} — only Verified closes the finding
      </p>
      <p id={descriptionId} className="mt-0.5 text-xs text-muted-foreground">
        {currentDisplay.description}
      </p>
      <ol
        aria-label="Remediation progress"
        aria-describedby={descriptionId}
        className="mt-2 flex items-center gap-1"
      >
        {REMEDIATION_STATUSES.map((step, index) => {
          const state =
            index < currentIndex
              ? "done"
              : index === currentIndex
                ? "current"
                : "upcoming";
          const display = remediationStatusDisplay(step);
          return (
            <li key={step} className="flex min-w-0 items-center gap-1">
              {index > 0 ? (
                <span
                  aria-hidden
                  className="h-px w-3 shrink-0 bg-border sm:w-5"
                />
              ) : null}
              <span
                aria-current={state === "current" ? "step" : undefined}
                aria-label={`${display.label}${state === "current" ? " (current step)" : state === "done" ? " (completed)" : ""}`}
                title={display.description}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
                  state === "done" &&
                    "border-status-passed/40 bg-status-passed/10 text-status-passed",
                  state === "current" &&
                    "border-signal/50 bg-signal/10 text-signal",
                  state === "upcoming" &&
                    "border-border/70 text-muted-foreground",
                )}
              >
                {state === "done" ? (
                  <Check className="size-3 shrink-0" aria-hidden />
                ) : (
                  <span
                    aria-hidden
                    className={cn(
                      "size-1.5 shrink-0 rounded-full",
                      state === "current"
                        ? "bg-signal"
                        : "bg-muted-foreground/40",
                    )}
                  />
                )}
                {/* Upcoming step labels collapse on mobile — the current step
                    label above always names the position. */}
                <span className={cn(state === "upcoming" && "hidden sm:inline")}>
                  {display.label}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
