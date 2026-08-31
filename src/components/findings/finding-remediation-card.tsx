import {
  ConfidenceBadge,
  ProvenanceBadge,
} from "@/components/badges";
import { CodeBlock, formatDateTime } from "@/components/page-primitives";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { remediationStatusLabel } from "@/core/labels";
import type { RemediationStatus } from "@/core/statuses";
import type { Finding, Remediation } from "@/core/finding-types";
import { cn } from "@/lib/utils";
import { generateAiRemediationAction } from "@/server/actions/remediation-ai";
import { Check } from "lucide-react";
import { AiActionForm } from "./ai-action-form";
import { FindingActionPanel } from "./finding-action-panel";

const LIFECYCLE: RemediationStatus[] = [
  "detected",
  "investigating",
  "suggested",
  "approved",
  "implemented",
  "verified",
];

export function FindingRemediationCard({
  finding,
  remediation,
  canRemediate,
  aiAvailable,
}: {
  finding: Finding;
  remediation: Remediation;
  canRemediate: boolean;
  aiAvailable: boolean;
}) {
  const currentIndex = LIFECYCLE.indexOf(remediation.status);

  return (
    <Card className="shadow-none ring-1 ring-border/60">
      <CardHeader>
        <CardTitle>Remediation</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <ol
          className="grid gap-2 sm:grid-cols-6"
          aria-label="Remediation lifecycle"
        >
          {LIFECYCLE.map((status, index) => {
            const reached = currentIndex >= index;
            const isCurrent = currentIndex === index;
            const label = remediationStatusLabel(status);
            return (
              <li key={status} className="relative min-w-0">
                {index < LIFECYCLE.length - 1 ? (
                  <span
                    className={cn(
                      "absolute top-3 left-[calc(50%+0.75rem)] hidden h-px w-[calc(100%-1.5rem)] sm:block",
                      reached && currentIndex > index
                        ? "bg-signal"
                        : "bg-border",
                    )}
                    aria-hidden
                  />
                ) : null}
                <div
                  className={cn(
                    "flex flex-col items-center gap-1.5 rounded-lg px-1 py-2 text-center transition-colors",
                    isCurrent && "bg-signal/10 ring-1 ring-signal/30",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-6 items-center justify-center rounded-full text-[10px] font-semibold",
                      isCurrent
                        ? "bg-signal text-signal-foreground"
                        : reached
                          ? "bg-signal/20 text-signal"
                          : "bg-muted text-muted-foreground",
                    )}
                    aria-hidden
                  >
                    {reached && !isCurrent ? (
                      <Check className="size-3.5" />
                    ) : (
                      index + 1
                    )}
                  </span>
                  <span
                    aria-current={isCurrent ? "step" : undefined}
                    className={cn(
                      "text-[11px] font-medium leading-tight",
                      isCurrent
                        ? "text-foreground"
                        : reached
                          ? "text-foreground/80"
                          : "text-muted-foreground",
                    )}
                  >
                    {label}
                  </span>
                </div>
              </li>
            );
          })}
        </ol>

        {remediation.suggestion ? (
          <div className="flex flex-col gap-3 rounded-xl border border-border/70 bg-muted/20 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <ProvenanceBadge
                provenance={remediation.suggestion.provenance ?? "deterministic"}
              />
              {remediation.suggestion.confidence ? (
                <ConfidenceBadge confidence={remediation.suggestion.confidence} />
              ) : null}
              {remediation.suggestion.model ? (
                <span className="font-mono text-xs text-muted-foreground">
                  {remediation.suggestion.model}
                </span>
              ) : null}
            </div>
            <p className="text-sm text-muted-foreground">
              {remediation.suggestion.description}
            </p>
            <CodeBlock>{remediation.suggestion.proposedSnippet}</CodeBlock>
          </div>
        ) : null}

        {finding.status === "open" &&
        canRemediate &&
        (remediation.status === "detected" ||
          remediation.status === "suggested") ? (
          <div>
            <AiActionForm
              action={generateAiRemediationAction.bind(null, finding.id)}
              submitLabel={
                remediation.suggestion
                  ? "Refine with AI remediation"
                  : "Generate AI remediation"
              }
              pendingLabel="Generating…"
              disabled={!aiAvailable}
            />
            {!aiAvailable ? (
              <p className="mt-1.5 text-xs text-muted-foreground">
                Without AI credentials, use the deterministic suggestion (when
                present) or fix manually and mark implemented after approval.
              </p>
            ) : null}
          </div>
        ) : null}

        {finding.status === "open" || remediation.status === "verified" ? (
          <FindingActionPanel
            finding={finding}
            remediation={remediation}
            canRemediate={canRemediate}
            compact
          />
        ) : null}

        {remediation.history.length > 0 ? (
          <>
            <Separator />
            <details>
              <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                History ({remediation.history.length})
              </summary>
              <ul className="mt-2 flex flex-col gap-1.5 border-l border-border pl-3 text-xs text-muted-foreground">
                {remediation.history.map((entry, index) => (
                  <li key={`${entry.at}-${index}`} className="relative">
                    <span
                      className="absolute top-1.5 -left-[0.9rem] size-1.5 rounded-full bg-border"
                      aria-hidden
                    />
                    <time dateTime={entry.at}>{formatDateTime(entry.at)}</time>
                    {" — "}
                    {remediationStatusLabel(entry.status)}
                    {entry.note ? `: ${entry.note}` : ""}
                  </li>
                ))}
              </ul>
            </details>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
