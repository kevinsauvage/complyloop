import { AlertTriangle, ChevronDown, ShieldCheck } from "lucide-react";
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
import type { Control, Requirement, RequirementStatus } from "@/core/types";
import {
  clearRequirementExceptionAction,
  clearRequirementHumanPassAction,
  markRequirementExceptionAction,
  markRequirementPassedAction,
} from "@/server/actions/requirements";

function statusBorderClass(status: RequirementStatus): string {
  switch (status) {
    case "passed":
      return "border-l-emerald-500/60";
    case "failed":
      return "border-l-destructive/60";
    case "needs_review":
      return "border-l-amber-500/60";
    case "not_applicable":
      return "border-l-muted-foreground/30";
    case "unable_to_verify":
      return "border-l-violet-500/60";
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
}: {
  control: Control;
  requirement: Requirement;
  openCount: number;
  canRemediate: boolean;
}) {
  return (
    <Card className={cn("border-l-4", statusBorderClass(requirement.status))}>
      <CardHeader className="pb-2">
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

      <CardContent className="flex flex-col gap-3 pt-0">
        {requirement.humanPass ? (
          <Alert className="border-emerald-500/30 bg-emerald-500/10">
            <ShieldCheck className="size-4 text-emerald-400" aria-hidden />
            <AlertTitle className="text-emerald-400">
              Human pass recorded
            </AlertTitle>
            <AlertDescription className="text-emerald-300/80">
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
          <Alert className="border-amber-500/30 bg-amber-500/10">
            <AlertTriangle className="size-4 text-amber-400" aria-hidden />
            <AlertTitle className="text-amber-400">
              Exception:{" "}
              {requirement.exception.reason.replace(/_/g, " ")}
            </AlertTitle>
            <AlertDescription className="text-amber-300/80">
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
                  Record exception (N/A · accepted risk · compensating · temporary)
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
