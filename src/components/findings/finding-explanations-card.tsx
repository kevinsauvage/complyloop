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
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { Finding } from "@/core/finding-types";
import { generateAiExplanationAction } from "@/server/actions/remediation-ai";

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
    <Card>
      <CardHeader>
        <CardTitle>Explanation</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-xs text-muted-foreground">
          Deterministic baseline is always present. AI explanations are optional
          enrichment and never set compliance status.
        </p>

        {finding.explanations.map((explanation, index) => (
          <div key={`${explanation.provenance}-${explanation.generatedAt}-${index}`}>
            {index > 0 ? <Separator className="mb-4" /> : null}
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <ProvenanceBadge provenance={explanation.provenance} />
              {explanation.confidence ? (
                <ConfidenceBadge confidence={explanation.confidence} />
              ) : null}
              {explanation.model ? (
                <span className="text-xs text-muted-foreground">
                  {explanation.model}
                </span>
              ) : null}
            </div>
            <dl className="flex flex-col gap-3 text-sm">
              <div>
                <dt className="font-medium">Why it failed</dt>
                <dd className="mt-0.5 text-muted-foreground">
                  {explanation.whyItFailed}
                </dd>
              </div>
              <div>
                <dt className="font-medium">Impact</dt>
                <dd className="mt-0.5 text-muted-foreground">
                  {explanation.impact}
                </dd>
              </div>
              <div>
                <dt className="font-medium">How to fix</dt>
                <dd className="mt-0.5 text-muted-foreground">
                  {explanation.howToFix}
                </dd>
              </div>
            </dl>
          </div>
        ))}

        {finding.status === "open" && canRemediate ? (
          <div>
            <form action={generateAiExplanationAction.bind(null, finding.id)}>
              <Button
                type="submit"
                variant="outline"
                size="sm"
                disabled={!aiAvailable}
              >
                Generate AI explanation
              </Button>
            </form>
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
