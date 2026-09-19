import type {
  Finding,
  Remediation,
} from "@complyloop/analysis-core/contract/entities";

import type { PatchCandidate } from "@/ai/verified-fix";
import { StatefulActionForm } from "@/components/forms/stateful-action-form";
import { CodeBlock } from "@/components/primitives/code-block";
import { PermissionNotice } from "@/components/primitives/permission-notice";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FindingActView } from "@/core/finding-act";
import { cn } from "@/lib/utils";
import { generateAiFixAction } from "@/server/actions/ai-fix";
import { approveRemediationAction } from "@/server/actions/remediation";
import { generateAiRemediationAction } from "@/server/actions/remediation-ai";
import {
  attestRemediationVerifiedAction,
  markRemediationImplementedAction,
  verifyRemediationAction,
} from "@/server/actions/remediation-verify";
import type { PatchUiState } from "@/server/assessment/ai-fix";

import { CreatePrForm } from "./create-pr-form";
import { RemediationStepper } from "./remediation-stepper";
import { SecondaryFindingActions } from "./secondary-finding-actions";

function PatchPreview({ candidate }: { candidate: PatchCandidate }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{candidate.description}</p>
      <p className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2 text-xs font-medium text-status-passed">
        Deterministic check passed
      </p>
      {candidate.edits.map((edit, index) => (
        <CodeBlock key={`${edit.path}-${index}`} filename={edit.path}>
          {`- ${edit.oldText}\n+ ${edit.newText}`}
        </CodeBlock>
      ))}
    </div>
  );
}

function ActControls({
  act,
  finding,
  remediation,
  canRemediate,
  patchState,
  suggestionStale,
}: {
  act: FindingActView;
  finding: Finding;
  remediation: Remediation;
  canRemediate: boolean;
  patchState: PatchUiState;
  suggestionStale: boolean;
}) {
  if (!canRemediate) {
    return null;
  }

  switch (act.beat) {
    case "source_generate":
      return act.canGenerate ? (
        <StatefulActionForm
          action={generateAiFixAction.bind(null, finding.id)}
          submitLabel={act.generateLabel}
          retryLabel="Try again"
          pendingLabel="Generating and verifying…"
          variant="default"
          size="sm"
          className="flex flex-col gap-1.5"
        />
      ) : null;
    case "source_review":
      return (
        <>
          {patchState.status === "ready" ? (
            <PatchPreview candidate={patchState.candidate} />
          ) : null}
          {act.showCreatePr ? <CreatePrForm findingId={finding.id} /> : null}
          {act.showReplacePatch ? (
            <details>
              <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
                Try another patch
              </summary>
              <div className="mt-2">
                <StatefulActionForm
                  action={generateAiFixAction.bind(null, finding.id)}
                  submitLabel="Try again"
                  retryLabel="Try again"
                  pendingLabel="Generating and verifying…"
                  variant="outline"
                  size="sm"
                  className="flex flex-col gap-1.5"
                />
              </div>
            </details>
          ) : null}
        </>
      );
    case "source_in_review":
      return (
        <div>
          <Button asChild>
            <a href={act.prUrl} target="_blank" rel="noopener noreferrer">
              Open draft PR
            </a>
          </Button>
        </div>
      );
    case "runtime_generate":
      return (
        <>
          <StatefulActionForm
            action={generateAiRemediationAction.bind(null, finding.id)}
            submitLabel="Generate guidance"
            pendingLabel="Generating…"
            disabled={!act.canGenerate}
            variant="default"
            size="sm"
            className="flex flex-col gap-1.5"
          />
          {!act.canGenerate ? (
            <p className="text-xs text-muted-foreground">
              AI guidance isn&apos;t enabled for this workspace.
            </p>
          ) : null}
        </>
      );
    case "runtime_approve":
      return (
        <>
          {remediation.suggestion ? (
            <div className="space-y-2">
              {suggestionStale ? (
                <p
                  role="alert"
                  className="rounded-lg border border-signal/30 bg-signal/10 px-3 py-2 text-xs font-medium text-foreground"
                >
                  This suggestion predates the latest scan — the finding moved.
                  Generate fresh guidance before approving.
                </p>
              ) : null}
              <p className="text-sm text-muted-foreground">
                {remediation.suggestion.description}
              </p>
              <CodeBlock>{remediation.suggestion.proposedSnippet}</CodeBlock>
            </div>
          ) : null}
          <StatefulActionForm
            action={approveRemediationAction.bind(null, finding.id)}
            submitLabel="Approve"
            variant="default"
          />
        </>
      );
    case "runtime_implement":
      return (
        <StatefulActionForm
          action={markRemediationImplementedAction.bind(null, finding.id)}
          submitLabel="Mark implemented"
          variant="default"
          className="flex flex-col gap-2"
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mark-implemented-note">Implementation note</Label>
            <Input
              id="mark-implemented-note"
              type="text"
              name="note"
              className="max-w-md"
              aria-describedby="mark-implemented-note-hint"
            />
            <p
              id="mark-implemented-note-hint"
              className="text-xs text-muted-foreground"
            >
              Optional — e.g. the PR number, kept as evidence.
            </p>
          </div>
        </StatefulActionForm>
      );
    case "runtime_verify":
      return (
        <div className="flex flex-col gap-2">
          <StatefulActionForm
            action={verifyRemediationAction.bind(null, finding.id)}
            submitLabel="Verify fix (automated re-check)"
            pendingLabel="Verifying…"
            variant="default"
          />
          {finding.status === "resolved" ? (
            <StatefulActionForm
              action={attestRemediationVerifiedAction.bind(null, finding.id)}
              submitLabel="Mark verified (manual confirmation)"
              pendingLabel="Confirming…"
              variant="secondary"
              className="flex flex-col gap-2"
            >
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="attest-verify-note">Confirmation note</Label>
                <Input
                  id="attest-verify-note"
                  type="text"
                  name="note"
                  required
                  maxLength={2000}
                  className="max-w-md"
                  aria-describedby="attest-verify-note-hint"
                />
                <p
                  id="attest-verify-note-hint"
                  className="text-xs text-muted-foreground"
                >
                  Required — how you confirmed the fix (re-audit is unavailable
                  or inconclusive for this finding).
                </p>
              </div>
            </StatefulActionForm>
          ) : null}
        </div>
      );
    case "verified":
    case "dismissed":
    case "view_only":
      return null;
    default: {
      const _exhaustive: never = act;
      throw new Error(`Unhandled act beat: ${String(_exhaustive)}`);
    }
  }
}

export function FindingNextStepPanel({
  act,
  finding,
  remediation,
  canRemediate,
  patchState = { status: "idle" },
  suggestionStale = false,
}: {
  act: FindingActView;
  finding: Finding;
  remediation: Remediation;
  canRemediate: boolean;
  patchState?: PatchUiState;
  suggestionStale?: boolean;
}) {
  const isTerminalBeat =
    act.beat === "verified" ||
    act.beat === "dismissed" ||
    act.beat === "view_only";
  const cardBorder = isTerminalBeat ? "border-border/60" : "border-signal/30";
  return (
    <Card
      className={cn(
        cardBorder,
        "bg-card shadow-none",
        "md:sticky md:top-4 md:z-10",
      )}
    >
      <CardHeader className="gap-1 pb-3">
        <CardTitle className="text-base font-medium">{act.title}</CardTitle>
        {act.beat === "view_only" ? (
          <PermissionNotice>{act.description}</PermissionNotice>
        ) : (
          <CardDescription
            className={
              act.beat === "verified" ? "text-status-passed" : undefined
            }
          >
            {act.description}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3 pt-0">
        <RemediationStepper status={remediation.status} />
        <ActControls
          act={act}
          finding={finding}
          remediation={remediation}
          canRemediate={canRemediate}
          patchState={patchState}
          suggestionStale={suggestionStale}
        />
        {act.showDismiss ? (
          <>
            <p className="text-xs text-muted-foreground">
              Not actually a finding? Dismiss it with a documented reason — the
              decision is kept as evidence.
            </p>
            <SecondaryFindingActions
              findingId={finding.id}
              showHandoff={act.showHandoff}
            />
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
