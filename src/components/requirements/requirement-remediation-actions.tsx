"use client";

import { AlertTriangle, ChevronDown, ShieldCheck } from "lucide-react";
import { formatDateTime } from "@/components/page-primitives";
import { StatefulActionForm } from "@/components/stateful-action-form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ReasonNoteFields } from "@/components/reason-note-fields";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { Control, Requirement } from "@/core/project-types";
import {
  clearRequirementExceptionAction,
  clearRequirementHumanPassAction,
  markRequirementExceptionAction,
  markRequirementPassedAction,
} from "@/server/actions/requirements";

export function RequirementRemediationActions({
  control,
  requirement,
  canRemediate,
}: {
  control: Control;
  requirement: Requirement;
  canRemediate: boolean;
}) {
  if (!canRemediate && !requirement.humanPass && !requirement.exception) {
    return null;
  }

  return (
    <>
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
            Exception: {requirement.exception.reason.replace(/_/g, " ")}
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
              <CollapsibleTrigger
                className={cn(
                  buttonVariants({ variant: "ghost", size: "sm" }),
                  "group h-auto justify-start gap-1.5 px-0 text-xs text-muted-foreground hover:text-foreground",
                )}
              >
                Mark passed (human review)
                <ChevronDown className="size-3 transition-transform group-data-[state=open]:rotate-180" />
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
            <CollapsibleTrigger
              className={cn(
                buttonVariants({ variant: "ghost", size: "sm" }),
                "group h-auto justify-start gap-1.5 px-0 text-xs text-muted-foreground hover:text-foreground",
              )}
            >
              Record exception
              <ChevronDown className="size-3 transition-transform group-data-[state=open]:rotate-180" />
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
                <ReasonNoteFields
                  reasonId={`exception-reason-${requirement.id}`}
                  noteId={`exception-note-${requirement.id}`}
                  noteLabel="Note (required, kept as evidence)"
                  noteRequired
                  options={[
                    { value: "not_applicable", label: "Not applicable" },
                    { value: "accepted_risk", label: "Accepted risk" },
                    {
                      value: "compensating_control",
                      label: "Compensating control",
                    },
                    { value: "temporary", label: "Temporary" },
                  ]}
                />
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
              </StatefulActionForm>
            </CollapsibleContent>
          </Collapsible>
        </div>
      ) : null}
    </>
  );
}
