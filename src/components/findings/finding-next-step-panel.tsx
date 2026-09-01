import { FindingActionPanel } from "@/components/findings/finding-action-panel";
import { FindingDismissCard } from "@/components/findings/finding-dismiss-card";
import { CreatePrForm } from "@/components/create-pr-form";
import { AiActionForm } from "@/components/findings/ai-action-form";
import { CodeBlock } from "@/components/page-primitives";
import { PermissionNotice } from "@/components/permission-notice";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { findingAct, type FindingActView } from "@/core/finding-act";
import type { Finding, Remediation } from "@/core/finding-types";
import { cn } from "@/lib/utils";
import type { PatchCandidate } from "@/ai/verified-fix";
import type { PatchUiState } from "@/server/ai-fix-result";
import { generateAiFixAction } from "@/server/actions/ai-fix";
import { generateAiRemediationAction } from "@/server/actions/remediation-ai";

function PatchPreview({ candidate }: { candidate: PatchCandidate }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{candidate.description}</p>
      <p className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2 text-xs font-medium text-status-passed">
        ComplyLoop passed
      </p>
      {candidate.edits.map((edit, index) => (
        <div key={`${edit.path}-${index}`} className="space-y-1">
          <p className="font-mono text-xs text-muted-foreground">{edit.path}</p>
          <CodeBlock>{`- ${edit.oldText}\n+ ${edit.newText}`}</CodeBlock>
        </div>
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
}: {
  act: FindingActView;
  finding: Finding;
  remediation: Remediation;
  canRemediate: boolean;
  patchState: PatchUiState;
}) {
  switch (act.beat) {
    case "source_generate":
      return act.canGenerate ? (
        <AiActionForm
          action={generateAiFixAction.bind(null, finding.id)}
          submitLabel={act.generateLabel}
          retryLabel="Try again"
          pendingLabel="Generating and verifying…"
          variant="default"
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
                <AiActionForm
                  action={generateAiFixAction.bind(null, finding.id)}
                  submitLabel="Try again"
                  retryLabel="Try again"
                  pendingLabel="Generating and verifying…"
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
          <AiActionForm
            action={generateAiRemediationAction.bind(null, finding.id)}
            submitLabel="Generate guidance"
            pendingLabel="Generating…"
            disabled={!act.canGenerate}
            variant="default"
          />
          {act.showHandoff ? (
            <p className="text-xs text-muted-foreground">
              Or use{" "}
              <a
                href="#copy-handoff"
                className="underline underline-offset-4 hover:text-foreground"
              >
                copy call-site notes
              </a>{" "}
              below.
            </p>
          ) : null}
        </>
      );
    case "runtime_approve":
    case "runtime_implement":
    case "runtime_verify":
      return (
        <>
          {act.beat === "runtime_approve" && remediation.suggestion ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                {remediation.suggestion.description}
              </p>
              <CodeBlock>{remediation.suggestion.proposedSnippet}</CodeBlock>
            </div>
          ) : null}
          <FindingActionPanel
            findingId={finding.id}
            remediation={remediation}
            canRemediate={canRemediate}
          />
        </>
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
  finding,
  remediation,
  canRemediate,
  githubConnected,
  prUrl,
  aiAvailable = false,
  patchState = { status: "idle" },
}: {
  finding: Finding;
  remediation: Remediation;
  canRemediate: boolean;
  githubConnected: boolean;
  prUrl: string | null;
  aiAvailable?: boolean;
  patchState?: PatchUiState;
}) {
  const act = findingAct({
    finding,
    remediation,
    canRemediate,
    prUrl,
    aiAvailable,
    patchReady: patchState.status === "ready",
    githubConnected,
  });

  return (
    <Card
      className={cn(
        "border-signal/30 bg-card shadow-none ring-1 ring-signal/25",
        "md:sticky md:top-4 md:z-10",
      )}
    >
      <CardHeader className="gap-1 pb-3">
        <CardTitle>
          <h2 className="text-base font-medium">{act.title}</h2>
        </CardTitle>
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
        <ActControls
          act={act}
          finding={finding}
          remediation={remediation}
          canRemediate={canRemediate}
          patchState={patchState}
        />
        {act.showDismiss ? (
          <>
            <p className="text-xs text-muted-foreground">
              Not a real failure?{" "}
              <a
                href="#dismiss-finding"
                className="underline underline-offset-4 hover:text-foreground"
              >
                Dismiss with a documented reason
              </a>
            </p>
            <details id="dismiss-finding">
              <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
                Dismiss this finding
              </summary>
              <div className="mt-3">
                <FindingDismissCard findingId={finding.id} />
              </div>
            </details>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
