import {
  ConfidenceBadge,
  ProvenanceBadge,
} from "@/components/badges";
import { Card } from "@/components/ui";
import type { Finding } from "@/core/types";
import { generateAiExplanationAction } from "@/server/actions/remediation-ai";
import { secondaryButtonDisabled } from "@/components/action-button-styles";

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
    <Card title="Explanation">
      <p className="mb-3 text-xs text-zinc-500">
        Deterministic baseline is always present. AI explanations are optional
        enrichment and never set compliance status.
      </p>
      {finding.explanations.map((explanation, index) => (
        <div
          key={`${explanation.provenance}-${explanation.generatedAt}-${index}`}
          className={index > 0 ? "mt-5 border-t border-zinc-100 pt-5" : undefined}
        >
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <ProvenanceBadge provenance={explanation.provenance} />
            {explanation.confidence ? (
              <ConfidenceBadge confidence={explanation.confidence} />
            ) : null}
            {explanation.model ? (
              <span className="text-xs text-zinc-500">{explanation.model}</span>
            ) : null}
          </div>
          <dl className="flex flex-col gap-3 text-sm">
            <div>
              <dt className="font-medium text-zinc-900">Why it failed</dt>
              <dd className="mt-0.5 text-zinc-600">{explanation.whyItFailed}</dd>
            </div>
            <div>
              <dt className="font-medium text-zinc-900">Impact</dt>
              <dd className="mt-0.5 text-zinc-600">{explanation.impact}</dd>
            </div>
            <div>
              <dt className="font-medium text-zinc-900">How to fix</dt>
              <dd className="mt-0.5 text-zinc-600">{explanation.howToFix}</dd>
            </div>
          </dl>
        </div>
      ))}
      {finding.status === "open" && canRemediate ? (
        <form
          action={generateAiExplanationAction.bind(null, finding.id)}
          className="mt-4"
        >
          <button
            type="submit"
            disabled={!aiAvailable}
            className={secondaryButtonDisabled}
          >
            Generate AI explanation
          </button>
          {!aiAvailable ? (
            <p className="mt-1 text-xs text-zinc-500">
              Set <code className="font-mono">AI_GATEWAY_API_KEY</code> to
              enrich with AI. The deterministic explanation above remains the
              happy-path baseline.
            </p>
          ) : null}
        </form>
      ) : null}
    </Card>
  );
}
