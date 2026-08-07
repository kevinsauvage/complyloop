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
import { generateAiRemediationAction } from "@/server/actions/remediation-ai";
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
    <Card>
      <CardHeader>
        <CardTitle>Remediation</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <ol className="flex flex-wrap items-center gap-1 text-xs" aria-label="Remediation lifecycle">
          {LIFECYCLE.map((status, index) => {
            const reached = currentIndex >= index;
            const isCurrent = currentIndex === index;
            return (
              <li key={status} className="flex items-center gap-1">
                {index > 0 ? (
                  <span className="text-muted-foreground/40" aria-hidden>→</span>
                ) : null}
                <span
                  aria-current={isCurrent ? "step" : undefined}
                  className={`rounded-full px-2 py-0.5 font-medium transition-colors ${
                    isCurrent
                      ? "bg-primary text-primary-foreground"
                      : reached
                        ? "bg-muted text-foreground"
                        : "bg-muted/50 text-muted-foreground"
                  }`}
                >
                  {remediationStatusLabel(status)}
                </span>
              </li>
            );
          })}
        </ol>

        {remediation.suggestion ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <ProvenanceBadge
                provenance={remediation.suggestion.provenance ?? "deterministic"}
              />
              {remediation.suggestion.confidence ? (
                <ConfidenceBadge confidence={remediation.suggestion.confidence} />
              ) : null}
              {remediation.suggestion.model ? (
                <span className="text-xs text-muted-foreground">
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
          />
        ) : null}

        {remediation.history.length > 0 ? (
          <>
            <Separator />
            <details>
              <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
                History ({remediation.history.length})
              </summary>
              <ul className="mt-2 flex flex-col gap-1 text-xs text-muted-foreground">
                {remediation.history.map((entry, index) => (
                  <li key={`${entry.at}-${index}`}>
                    {formatDateTime(entry.at)} — {remediationStatusLabel(entry.status)}
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
