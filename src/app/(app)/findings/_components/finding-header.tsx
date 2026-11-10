import { RotateCcw } from "lucide-react";
import Link from "next/link";

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
import {
  LedgerFact,
  LedgerStrip,
} from "@/components/primitives/page-primitives";
import { confidenceDisplay, engineDisplay } from "@/core/display/status";
import {
  findingDetailHref,
  type FindingListParams,
} from "@/core/filter-params/findings";

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
              className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl"
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

      <LedgerStrip
        label="Finding facts"
        className="grid-cols-2 sm:grid-cols-3 xl:grid-cols-6"
      >
        <LedgerFact
          valueClassName="flex min-h-6 items-center gap-1.5"
          label="Severity"
        >
          <SeverityBadge severity={finding.severity} />
        </LedgerFact>
        <LedgerFact
          valueClassName="flex min-h-6 items-center gap-1.5"
          label="Status"
        >
          <FindingStatusBadge status={finding.status} />
        </LedgerFact>
        <LedgerFact
          valueClassName="flex min-h-6 items-center gap-1.5"
          label="Remediation"
        >
          <RemediationStatusBadge status={remediation.status} />
        </LedgerFact>
        <LedgerFact
          valueClassName="flex min-h-6 items-center gap-1.5"
          label="Detected by"
        >
          <span className="cursor-help truncate" title={engine.description}>
            {engine.label}
            <span className="sr-only">: {engine.description}</span>
          </span>
        </LedgerFact>
        <LedgerFact
          valueClassName="flex min-h-6 items-center gap-1.5"
          label="Confidence"
        >
          <span
            className="cursor-help capitalize"
            title={confidence.description}
          >
            {finding.confidence}
            <span className="sr-only">: {confidence.description}</span>
          </span>
        </LedgerFact>
        <LedgerFact
          valueClassName="flex min-h-6 items-center gap-1.5"
          label="Check"
        >
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
        </LedgerFact>
      </LedgerStrip>
    </header>
  );
}
