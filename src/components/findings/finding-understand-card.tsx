import {
  ConfidenceBadge,
  ProvenanceBadge,
} from "@/components/badges";
import { AiActionForm } from "@/components/findings/ai-action-form";
import { CodeBlock } from "@/components/page-primitives";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { Explanation, Finding } from "@/core/finding-types";
import { formatLocationRef, isDomLocation, locationSnippet, domLocationDetails } from "@/core/location";
import { generateAiExplanationAction } from "@/server/actions/remediation-ai";
import { MapPin } from "lucide-react";

function baselineExplanation(finding: Finding): Explanation | undefined {
  return (
    finding.explanations.find(
      (explanation) => explanation.provenance === "deterministic",
    ) ?? finding.explanations[0]
  );
}

export function FindingUnderstandCard({
  finding,
  canRemediate,
  aiAvailable,
}: {
  finding: Finding;
  canRemediate: boolean;
  aiAvailable: boolean;
}) {
  const baseline = baselineExplanation(finding);
  const aiExplanations = finding.explanations.filter(
    (explanation) => explanation.provenance === "ai",
  );

  return (
    <Card className="shadow-none ring-1 ring-border/60">
      <CardHeader className="gap-1">
        <CardTitle className="flex items-center gap-2">
          <MapPin className="size-4 text-signal" aria-hidden />
          <h2 className="text-base font-medium">This Finding</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {baseline ? (
          <p className="text-sm leading-relaxed text-foreground">
            {baseline.whyItFailed}
          </p>
        ) : null}
        {isDomLocation(finding.location) ? (
          <dl className="flex flex-col gap-2 rounded-lg border border-border/50 bg-muted/30 px-3 py-2 text-sm">
            {domLocationDetails(finding.location).map((detail) => (
              <div key={detail.term} className="grid gap-0.5">
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {detail.term}
                </dt>
                <dd
                  className={
                    detail.term === "Selector"
                      ? "font-mono text-xs text-foreground break-all"
                      : "text-foreground"
                  }
                >
                  {detail.value}
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="rounded-lg border border-border/50 bg-muted/30 px-3 py-2 font-mono text-xs text-foreground">
            {formatLocationRef(finding.location)}
          </p>
        )}
        {isDomLocation(finding.location) ? (
          <p className="text-sm text-muted-foreground">
            Runtime finding on the rendered page. Tab to the element above on
            the live page, or search your codebase for the link text / selector.
          </p>
        ) : null}
        <CodeBlock>{locationSnippet(finding.location)}</CodeBlock>
        {baseline ? (
          <details>
            <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
              Impact and how to fix
            </summary>
            <div className="mt-2 flex flex-col gap-2 text-sm leading-relaxed text-muted-foreground">
              <p>{baseline.impact}</p>
              <p>{baseline.howToFix}</p>
            </div>
          </details>
        ) : null}
        <details>
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
            AI explanation
          </summary>
          <div className="mt-3 flex flex-col gap-3">
            {aiExplanations.map((explanation, index) => (
              <article
                key={`${explanation.generatedAt}-${index}`}
                className="rounded-lg border border-border/50 bg-muted/15 p-3"
                aria-label="AI explanation"
              >
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <ProvenanceBadge provenance="ai" />
                  {explanation.confidence ? (
                    <ConfidenceBadge confidence={explanation.confidence} />
                  ) : null}
                  {explanation.model ? (
                    <span className="font-mono text-xs text-muted-foreground">
                      {explanation.model}
                    </span>
                  ) : null}
                </div>
                <p className="text-sm text-muted-foreground">
                  {explanation.whyItFailed}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {explanation.impact}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {explanation.howToFix}
                </p>
              </article>
            ))}
            {finding.status === "open" && canRemediate ? (
              <div>
                <AiActionForm
                  action={generateAiExplanationAction.bind(null, finding.id)}
                  submitLabel="Generate AI explanation"
                  pendingLabel="Generating…"
                  disabled={!aiAvailable}
                />
                {!aiAvailable ? (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Set <code className="font-mono">AI_GATEWAY_API_KEY</code> to
                    enrich with AI. The explanation above remains the baseline.
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        </details>
      </CardContent>
    </Card>
  );
}
