import Link from "next/link";
import { AlertTriangle, ChevronDown, ShieldCheck } from "lucide-react";
import { isRuntimeOnlyCheck } from "@/analysis/check-authority";
import { DeterminationBadge, RequirementStatusBadge } from "@/components/badges";
import { formatDateTime } from "@/components/page-primitives";
import { StatefulActionForm } from "@/components/stateful-action-form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { RequirementStatus } from "@/core/statuses";
import type { Control, Project, Requirement } from "@/core/project-types";
import {
  unableToVerifyReason,
  unableToVerifyReasonLabel,
} from "@/core/unable-to-verify-reason";
import {
  clearRequirementExceptionAction,
  clearRequirementHumanPassAction,
  markRequirementExceptionAction,
  markRequirementPassedAction,
} from "@/server/actions/requirements";

function statusAccentClass(status: RequirementStatus): string {
  switch (status) {
    case "passed":
      return "bg-status-passed";
    case "failed":
      return "bg-status-failed";
    case "needs_review":
      return "bg-status-review";
    case "not_applicable":
      return "bg-status-na";
    case "unable_to_verify":
      return "bg-status-unverifiable";
    default: {
      const _exhaustive: never = status;
      throw new Error(`Unhandled requirement status: ${_exhaustive}`);
    }
  }
}

export function RequirementCard({
  control,
  requirement,
  openCount,
  canRemediate,
  project,
}: {
  control: Control;
  requirement: Requirement;
  openCount: number;
  canRemediate: boolean;
  project: Pick<Project, "runtimeBaseUrl">;
}) {
  const unverifiableReason =
    requirement.status === "unable_to_verify"
      ? unableToVerifyReason(control, project, {
          isRuntimeOnlyCheck: control.checkId
            ? isRuntimeOnlyCheck(control.checkId)
            : false,
        })
      : null;

  return (
    <Card className="relative overflow-hidden shadow-none ring-1 ring-border/60 transition-[box-shadow,border-color] hover:ring-signal/30">
      <span
        className={cn(
          "absolute inset-y-0 left-0 w-1",
          statusAccentClass(requirement.status),
        )}
        aria-hidden
      />
      <CardHeader className="pb-2 pl-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-medium text-foreground">{control.title}</p>
            <p className="mt-0.5 font-mono text-xs text-muted-foreground">
              {control.code}
              {control.secondaryCode ? ` · ${control.secondaryCode}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <RequirementStatusBadge status={requirement.status} />
            <DeterminationBadge method={requirement.determination} />
          </div>
        </div>
        {control.description ? (
          <p className="mt-1 text-xs text-muted-foreground">
            {control.description}
          </p>
        ) : null}
        <p className="text-xs text-muted-foreground">
          {openCount === 1
            ? "1 open finding"
            : `${openCount} open findings`}{" "}
          · updated {formatDateTime(requirement.updatedAt)}
        </p>
      </CardHeader>

      <CardContent className="flex flex-col gap-3 pt-0 pl-5">
        {unverifiableReason ? (
          <Alert className="border-status-unverifiable/30 bg-status-unverifiable/10">
            <AlertTitle className="text-sm text-foreground">
              Unable to verify
            </AlertTitle>
            <AlertDescription className="text-sm text-muted-foreground">
              {unableToVerifyReasonLabel(unverifiableReason)}
              {unverifiableReason === "needs_preview_url" ||
              unverifiableReason === "runtime_only_pending" ? (
                <span className="mt-2 block">
                  <Link
                    href="/settings"
                    className="text-sm font-medium text-foreground underline underline-offset-4 hover:text-foreground"
                  >
                    Set preview URL in Settings
                  </Link>
                </span>
              ) : null}
            </AlertDescription>
          </Alert>
        ) : null}

        {requirement.humanPass ? (
          <Alert className="border-status-passed/30 bg-status-passed/10">
            <ShieldCheck className="size-4 text-status-passed" aria-hidden />
            <AlertTitle className="text-status-passed">
              Human pass recorded
            </AlertTitle>
            <AlertDescription className="text-muted-foreground">
              {requirement.humanPass.note}
              <span className="mt-1 block text-xs opacity-70">
                Set {formatDateTime(requirement.humanPass.at)} — sticky until
                cleared (assessments will not overwrite).
              </span>
              {canRemediate ? (
                <span className="mt-2 block">
                  <StatefulActionForm
                    action={clearRequirementHumanPassAction.bind(
                      null,
                      requirement.id,
                    )}
                    submitLabel="Clear human pass & return to unable to verify"
                    pendingLabel="Clearing…"
                    variant="outline"
                    size="sm"
                  />
                </span>
              ) : null}
            </AlertDescription>
          </Alert>
        ) : null}

        {requirement.exception ? (
          <Alert className="border-status-review/30 bg-status-review/10">
            <AlertTriangle className="size-4 text-status-review" aria-hidden />
            <AlertTitle className="text-status-review">
              Exception:{" "}
              {requirement.exception.reason.replace(/_/g, " ")}
            </AlertTitle>
            <AlertDescription className="text-muted-foreground">
              {requirement.exception.note}
              <span className="mt-1 block text-xs opacity-70">
                Set {formatDateTime(requirement.exception.at)}
                {requirement.exception.expiresAt
                  ? ` — expires ${formatDateTime(requirement.exception.expiresAt)}`
                  : " — sticky until cleared (assessments will not overwrite)"}
                .
              </span>
              {canRemediate ? (
                <span className="mt-2 block">
                  <StatefulActionForm
                    action={clearRequirementExceptionAction.bind(
                      null,
                      requirement.id,
                    )}
                    submitLabel="Clear exception & return to automated status"
                    pendingLabel="Clearing…"
                    variant="outline"
                    size="sm"
                  />
                </span>
              ) : null}
            </AlertDescription>
          </Alert>
        ) : canRemediate ? (
          <div className="flex flex-col gap-1 pt-1">
            {control.checkId === null && !requirement.humanPass ? (
              <Collapsible>
                <CollapsibleTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="group h-auto justify-start gap-1.5 px-0 text-xs text-muted-foreground hover:text-foreground"
                  >
                    Mark passed (human review)
                    <ChevronDown className="size-3 transition-transform group-data-[state=open]:rotate-180" />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-3">
                  <StatefulActionForm
                    action={markRequirementPassedAction.bind(
                      null,
                      requirement.id,
                    )}
                    submitLabel="Record human pass"
                    pendingLabel="Saving…"
                    variant="outline"
                    size="sm"
                    className="flex flex-col gap-3"
                  >
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor={`pass-note-${requirement.id}`}>
                        Evidence note (required)
                      </Label>
                      <Textarea
                        id={`pass-note-${requirement.id}`}
                        name="note"
                        required
                        rows={2}
                        placeholder="What was reviewed and why this control passes"
                        className="max-w-md"
                      />
                    </div>
                  </StatefulActionForm>
                </CollapsibleContent>
              </Collapsible>
            ) : null}

            <Collapsible>
              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="group h-auto justify-start gap-1.5 px-0 text-xs text-muted-foreground hover:text-foreground"
                >
                  Record exception
                  <ChevronDown className="size-3 transition-transform group-data-[state=open]:rotate-180" />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-3">
                <StatefulActionForm
                  action={markRequirementExceptionAction.bind(
                    null,
                    requirement.id,
                  )}
                  submitLabel="Record exception"
                  pendingLabel="Saving…"
                  variant="outline"
                  size="sm"
                  className="flex flex-col gap-3"
                >
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={`exception-reason-${requirement.id}`}>
                      Reason
                    </Label>
                    <select
                      id={`exception-reason-${requirement.id}`}
                      name="reason"
                      className="h-8 w-full max-w-md rounded-lg border border-input bg-transparent px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 dark:bg-input/30"
                    >
                      <option value="not_applicable">Not applicable</option>
                      <option value="accepted_risk">Accepted risk</option>
                      <option value="compensating_control">
                        Compensating control
                      </option>
                      <option value="temporary">Temporary</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={`exception-expires-${requirement.id}`}>
                      Expires (required for temporary)
                    </Label>
                    <input
                      id={`exception-expires-${requirement.id}`}
                      type="date"
                      name="expiresAt"
                      className="h-8 w-full max-w-md rounded-lg border border-input bg-transparent px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 dark:bg-input/30"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={`exception-note-${requirement.id}`}>
                      Note (required, kept as evidence)
                    </Label>
                    <Textarea
                      id={`exception-note-${requirement.id}`}
                      name="note"
                      required
                      rows={2}
                      className="max-w-md"
                    />
                  </div>
                </StatefulActionForm>
              </CollapsibleContent>
            </Collapsible>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
