import { RotateCcw } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import type {
  Finding,
  Remediation,
} from "@complyloop/analysis-core/contract/entities";
import { engineFor } from "@complyloop/analysis-core/contract/finding-types";
import type { Control } from "@complyloop/analysis-core/contract/project-types";

import {
  FindingStatusBadge,
  RemediationStatusBadge,
  SeverityBadge,
} from "@/components/primitives/badges";
import { CopyTextButton } from "@/components/primitives/copy-text-button";
import { confidenceDisplay, engineDisplay } from "@/core/display/status";
import {
  findingDetailHref,
  type FindingListParams,
} from "@/core/filter-params/findings";

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    // Every cell draws its right + bottom hairline; the wrapper clips the
    // outer ones, so the rules stay correct at 2, 3 or 6 columns.
    <div className="flex min-w-0 flex-col gap-1.5 border-r border-b border-border/60 px-5 py-3.5 sm:px-6">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="flex min-h-6 min-w-0 items-center gap-1.5 text-sm text-foreground">
        {children}
      </dd>
    </div>
  );
}

/**
 * Finding detail header: what was broken (requirement + its references),
 * the one primary action (hand the fix to an AI assistant), then the triage
 * facts on a single hairline strip — same idiom as the dashboard header, so
 * severity and status read as data, not as a row of loose pills.
 */
export function FindingHeader({
  finding,
  control,
  remediation,
  listParams,
  aiPrompt,
}: {
  finding: Finding;
  control: Pick<Control, "code" | "secondaryCode" | "title" | "description">;
  remediation: Pick<Remediation, "status">;
  listParams: FindingListParams;
  aiPrompt: string;
}) {
  const engine = engineDisplay(engineFor(finding));
  const confidence = confidenceDisplay(finding.confidence);
  const references = [control.code, control.secondaryCode].filter(Boolean);

  return (
    <header className="surface-panel relative mb-6 overflow-hidden rounded-xl">
      <div className="flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-start lg:justify-between lg:gap-10">
        <div className="min-w-0 space-y-3">
          <div className="space-y-1.5">
            <h1
              tabIndex={-1}
              className="text-2xl font-semibold tracking-tight text-balance outline-none focus-visible:ring-2 focus-visible:ring-ring/50 sm:text-3xl"
            >
              {control.title}
            </h1>
            <p className="font-mono text-sm text-foreground/80">
              {references.join(" · ")}
            </p>
          </div>
          {control.description ? (
            <p className="max-w-[65ch] text-sm leading-relaxed text-pretty text-muted-foreground">
              {control.description}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-start">
          <CopyTextButton
            label="Copy for AI"
            icon="ai"
            description="fix prompt for this finding"
            text={aiPrompt}
          />
        </div>
      </div>

      {finding.regressionOf ? (
        <p className="mx-5 mb-5 flex items-start gap-2 rounded-lg bg-status-failed/10 px-3 py-2 text-sm text-foreground sm:mx-6">
          <RotateCcw
            className="mt-0.5 size-4 shrink-0 text-status-failed"
            aria-hidden
          />
          <span>
            Regression — this instance was fixed before.{" "}
            <Link
              href={findingDetailHref(finding.regressionOf, {
                ...listParams,
                tab: "resolved",
                page: 1,
              })}
              className="font-medium underline underline-offset-4 hover:text-status-failed"
            >
              View the earlier finding
            </Link>
          </span>
        </p>
      ) : null}

      <div className="overflow-hidden border-t border-border/60">
        <dl className="-mr-px -mb-px grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6">
          <Fact label="Severity">
            <SeverityBadge severity={finding.severity} />
          </Fact>
          <Fact label="Status">
            <FindingStatusBadge status={finding.status} />
          </Fact>
          <Fact label="Remediation">
            <RemediationStatusBadge status={remediation.status} />
          </Fact>
          <Fact label="Detected by">
            <span className="cursor-help truncate" title={engine.description}>
              {engine.label}
              <span className="sr-only">: {engine.description}</span>
            </span>
          </Fact>
          <Fact label="Confidence">
            <span
              className="cursor-help capitalize"
              title={confidence.description}
            >
              {finding.confidence}
              <span className="sr-only">: {confidence.description}</span>
            </span>
          </Fact>
          <Fact label="Check">
            <code
              title={finding.checkId}
              className="min-w-0 truncate font-mono text-sm"
            >
              {finding.checkId}
            </code>
            <CopyTextButton
              label="Copy check ID"
              icon="copy"
              iconOnly
              size="icon-xs"
              text={finding.checkId}
            />
          </Fact>
        </dl>
      </div>
    </header>
  );
}
