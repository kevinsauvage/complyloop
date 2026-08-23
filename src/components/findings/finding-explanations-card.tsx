import {
  ConfidenceBadge,
  ProvenanceBadge,
} from "@/components/badges";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { Finding } from "@/core/finding-types";
import { generateAiExplanationAction } from "@/server/actions/remediation-ai";
import { AiActionForm } from "./ai-action-form";

const SECTIONS = [
  { key: "whyItFailed", title: "Why it failed", descriptionKey: "whyItFailed" },
  { key: "impact", title: "Impact", descriptionKey: "impact" },
  { key: "howToFix", title: "How to fix", descriptionKey: "howToFix" },
] as const;

export function FindingExplanationsCard({
  finding,
  canRemediate,
  aiAvailable,
}: {
  finding: Finding;
  canRemediate: boolean;
  aiAvailable: boolean;
}) {
  return (
    <Card className="shadow-none ring-1 ring-border/60">
      <CardHeader className="gap-2">
        <CardTitle>Explanation</CardTitle>
        <p className="text-xs text-muted-foreground">
          Deterministic baseline is always present. AI explanations are optional
          enrichment and never set compliance status.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {finding.explanations.map((explanation, index) => (
          <article
            key={`${explanation.provenance}-${explanation.generatedAt}-${index}`}
            className="rounded-xl border border-border/70 bg-muted/15 p-4"
            aria-label={`${explanation.provenance} explanation`}
          >
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <ProvenanceBadge provenance={explanation.provenance} />
              {explanation.confidence ? (
                <ConfidenceBadge confidence={explanation.confidence} />
              ) : null}
              {explanation.model ? (
                <span className="font-mono text-xs text-muted-foreground">
                  {explanation.model}
                </span>
              ) : null}
            </div>
            <dl className="grid gap-4 sm:grid-cols-3">
              {SECTIONS.map((section, sectionIndex) => (
                <div
                  key={section.key}
                  className="rounded-lg border border-border/50 bg-background/50 p-3"
                >
                  <dt className="flex items-center gap-2 text-xs font-semibold tracking-wide text-foreground uppercase">
                    <span
                      className="flex size-5 items-center justify-center rounded-full bg-signal/15 font-mono text-[10px] text-signal"
                      aria-hidden
                    >
                      {sectionIndex + 1}
                    </span>
                    {section.title}
                  </dt>
                  <dd className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {explanation[section.descriptionKey]}
                  </dd>
                </div>
              ))}
            </dl>
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
                enrich with AI. The deterministic explanation above remains the
                baseline.
              </p>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
