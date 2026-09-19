"use client";

import { AlertTriangle, ChevronDown, ShieldCheck } from "lucide-react";
import { useState } from "react";

import type { Requirement } from "@complyloop/analysis-core/contract/entities";
import type { Control } from "@complyloop/analysis-core/contract/project-types";

import { ReasonNoteFields } from "@/components/forms/reason-note-fields";
import { StatefulActionForm } from "@/components/forms/stateful-action-form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { humanizeReasonSlug } from "@/core/display";
import { cn } from "@/lib/utils";
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
  humanPassAtLabel,
  exceptionAtLabel,
  exceptionExpiresAtLabel,
}: {
  control: Control;
  requirement: Requirement;
  canRemediate: boolean;
  /** Server-formatted zone-qualified stamps (this file is client-rendered). */
  humanPassAtLabel?: string;
  exceptionAtLabel?: string;
  exceptionExpiresAtLabel?: string;
}) {
  // Drives the conditional `required` on the expiry date (server enforces it
  // too — this just surfaces the requirement before submit).
  const [exceptionReason, setExceptionReason] = useState("not_applicable");

  if (!canRemediate && !requirement.humanPass && !requirement.exception) {
    return (
      <p className="text-xs text-muted-foreground">
        Only editors can record passes or exceptions.
      </p>
    );
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
            <span className="mt-1 block text-xs text-muted-foreground">
              Set{" "}
              <time dateTime={requirement.humanPass.at}>
                {humanPassAtLabel ?? requirement.humanPass.at}
              </time>{" "}
              — sticky until cleared (assessments will not overwrite).
            </span>
            {canRemediate ? (
              <span className="mt-2 block">
                <StatefulActionForm
                  action={clearRequirementHumanPassAction.bind(
                    null,
                    requirement.id,
                  )}
                  submitLabel="Clear human pass"
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
            Exception: {humanizeReasonSlug(requirement.exception.reason)}
          </AlertTitle>
          <AlertDescription className="text-muted-foreground">
            {requirement.exception.note}
            <span className="mt-1 block text-xs text-muted-foreground">
              Set{" "}
              <time dateTime={requirement.exception.at}>
                {exceptionAtLabel ?? requirement.exception.at}
              </time>
              {requirement.exception.expiresAt ? (
                <>
                  {" "}
                  — expires{" "}
                  <time dateTime={requirement.exception.expiresAt}>
                    {exceptionExpiresAtLabel ??
                      requirement.exception.expiresAt}
                  </time>
                </>
              ) : (
                " — sticky until cleared (assessments will not overwrite)"
              )}
              .
            </span>
            {canRemediate ? (
              <span className="mt-2 block">
                <StatefulActionForm
                  action={clearRequirementExceptionAction.bind(
                    null,
                    requirement.id,
                  )}
                  submitLabel="Clear exception"
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
                  "group h-auto min-h-9 justify-start gap-1.5 px-2 py-1.5 text-sm text-muted-foreground hover:text-foreground",
                )}
              >
                Mark as passed by human review
                <ChevronDown className="size-3 transition-transform group-data-[state=open]:rotate-180" />
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-3">
                <p className="mb-3 text-xs text-muted-foreground">
                  Who can see this? Visible to the whole org and kept as
                  evidence until cleared.
                </p>
                <StatefulActionForm
                  action={markRequirementPassedAction.bind(
                    null,
                    requirement.id,
                  )}
                  submitLabel="Mark as passed by human review"
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
                      aria-describedby={`pass-note-${requirement.id}-hint`}
                      className="max-w-md"
                    />
                    <p
                      id={`pass-note-${requirement.id}-hint`}
                      className="text-xs text-muted-foreground"
                    >
                      Include what was checked and why it passes; kept as
                      evidence.
                    </p>
                  </div>
                </StatefulActionForm>
              </CollapsibleContent>
            </Collapsible>
          ) : null}

          <Collapsible>
            <CollapsibleTrigger
              className={cn(
                buttonVariants({ variant: "ghost", size: "sm" }),
                "group h-auto min-h-9 justify-start gap-1.5 px-2 py-1.5 text-sm text-muted-foreground hover:text-foreground",
              )}
            >
              Record exception
              <ChevronDown className="size-3 transition-transform group-data-[state=open]:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-3">
              <p className="mb-3 text-xs text-muted-foreground">
                Visible to the whole org and kept as evidence until cleared.
              </p>
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
                  onReasonChange={setExceptionReason}
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
                    Expires
                    {exceptionReason === "temporary"
                      ? " (required)"
                      : " (required for temporary)"}
                  </Label>
                  <input
                    id={`exception-expires-${requirement.id}`}
                    type="date"
                    name="expiresAt"
                    aria-label="Exception expiry date"
                    required={exceptionReason === "temporary"}
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
