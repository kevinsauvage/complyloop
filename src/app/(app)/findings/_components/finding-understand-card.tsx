import { ExternalLink, MapPin } from "lucide-react";

import type { Finding } from "@complyloop/analysis-core/contract/entities";
import type { Explanation } from "@complyloop/analysis-core/contract/finding-types";
import {
  formatLocationRef,
  isDomLocation,
  isSourceLocation,
  locationSnippet,
} from "@complyloop/analysis-core/contract/location";
import {
  describeAxeElement,
  visibleTextOf,
} from "@complyloop/analysis-core/runtime/dom-location";

import { StatefulActionForm } from "@/components/forms/stateful-action-form";
import {
  ConfidenceBadge,
  ProvenanceBadge,
} from "@/components/primitives/badges";
import { CodeBlock } from "@/components/primitives/code-block";
import { CopyButton } from "@/components/primitives/copy-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { generateAiExplanationAction } from "@/server/actions/remediation-ai";

function baselineExplanation(finding: Finding): Explanation | undefined {
  return (
    finding.explanations.find(
      (explanation) => explanation.provenance === "deterministic",
    ) ?? finding.explanations[0]
  );
}

/**
 * Rendered-page location block. Axe findings historically carried no
 * `elementLabel`, so derive `tag "visible text"` from the stored snippet —
 * existing rows become readable without a re-scan. The selector stays as a
 * copyable DevTools locator, never the headline.
 */
function DomElementBlock({ finding }: { finding: Finding }) {
  if (!isDomLocation(finding.location)) return null;
  const location = finding.location;
  const snippet = locationSnippet(finding.location);
  const label =
    location.elementLabel ?? describeAxeElement(snippet, location.selector);
  const visibleText = visibleTextOf(snippet);

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border/50 bg-muted/30 px-3 py-2 text-sm">
      <div className="grid gap-0.5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Element
        </p>
        <p className="text-sm font-semibold text-foreground">{label}</p>
        {visibleText && !label.includes(visibleText) ? (
          <p className="text-sm text-muted-foreground">
            Reads: &ldquo;{visibleText}&rdquo;
          </p>
        ) : null}
      </div>
      <div className="grid gap-0.5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Page
        </p>
        <p>
          <a
            href={location.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-foreground underline underline-offset-2 hover:text-signal break-all"
          >
            {location.url}
            <ExternalLink className="size-3 shrink-0" aria-hidden />
          </a>
        </p>
      </div>
      {location.selector && location.selector !== "(unknown)" ? (
        <div className="grid gap-0.5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Selector
          </p>
          <p className="font-mono text-xs text-foreground break-all">
            {location.selector}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <CopyButton label="Copy selector" text={location.selector} />
          </div>
        </div>
      ) : null}
      {location.context ? (
        <div className="grid gap-0.5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Context
          </p>
          <p className="text-foreground">{location.context}</p>
        </div>
      ) : null}
      <ol className="list-decimal space-y-0.5 pl-5 text-[13px] text-muted-foreground">
        <li>
          Open the live page above — this is what visitors experience, not
          source code.
        </li>
        <li>
          In DevTools press Cmd/Ctrl+F, paste the selector, and the failing{" "}
          {label.split(" ")[0]} highlights — then trace to the component that
          renders it (rendered text often comes from props or template
          expressions, not literal source).
        </li>
      </ol>
    </div>
  );
}

export function FindingUnderstandCard({
  finding,
  canRemediate,
  aiAvailable,
  githubFullName,
  defaultBranch = "main",
}: {
  finding: Finding;
  canRemediate: boolean;
  aiAvailable: boolean;
  /** `owner/repo` — enables the exact-line GitHub blob link. */
  githubFullName?: string;
  defaultBranch?: string;
}) {
  const baseline = baselineExplanation(finding);
  const aiExplanations = finding.explanations.filter(
    (explanation) => explanation.provenance === "ai",
  );

  return (
    <Card className="shadow-none">
      <CardHeader className="gap-1">
        <CardTitle className="flex items-center gap-2 text-base font-medium">
          <MapPin className="size-4 text-signal" aria-hidden />
          What failed
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {baseline ? (
          <p className="text-sm leading-relaxed text-foreground">
            {baseline.whyItFailed}
          </p>
        ) : null}
        {isDomLocation(finding.location) ? (
          <DomElementBlock finding={finding} />
        ) : isSourceLocation(finding.location) ? (
          <div className="flex flex-col gap-2 rounded-lg border border-border/50 bg-muted/30 px-3 py-2 text-sm">
            <p className="font-mono text-xs text-foreground break-all">
              {formatLocationRef(finding.location)}
            </p>
            {githubFullName ? (
              <p>
                <a
                  href={`https://github.com/${githubFullName}/blob/${defaultBranch}/${finding.location.filePath}#L${finding.location.line}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-medium text-foreground underline underline-offset-2 hover:text-signal"
                >
                  Open exact line on GitHub
                  <ExternalLink className="size-3" aria-hidden />
                </a>
              </p>
            ) : null}
          </div>
        ) : (
          <p className="rounded-lg border border-border/50 bg-muted/30 px-3 py-2 font-mono text-xs text-foreground">
            {formatLocationRef(finding.location)}
          </p>
        )}
        <CodeBlock>{locationSnippet(finding.location)}</CodeBlock>
        {baseline ? (
          <div className="flex flex-col gap-2 text-sm leading-relaxed">
            <div className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Why this matters
              </p>
              <p className="mt-1 text-muted-foreground">{baseline.impact}</p>
            </div>
            <div className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                How to fix
              </p>
              <p className="mt-1 text-muted-foreground">{baseline.howToFix}</p>
            </div>
          </div>
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
                <StatefulActionForm
                  action={generateAiExplanationAction.bind(null, finding.id)}
                  submitLabel="Generate AI explanation"
                  pendingLabel="Generating…"
                  disabled={!aiAvailable}
                  variant="outline"
                  size="sm"
                  className="flex flex-col gap-1.5"
                />
                {!aiAvailable ? (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    AI explanations aren&apos;t enabled for this workspace. The
                    guidance above is the baseline.
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
