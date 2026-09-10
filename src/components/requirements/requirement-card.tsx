import Link from "next/link";
import {
  isHeuristicCheck,
  isRuntimeOnlyCheck,
} from "@complyloop/analysis-core/check-authority";
import { isPertinenceTwinControl } from "@complyloop/adapters/rgaa/pertinence-twins";
import { RequirementStatusBadge } from "@/components/badges";
import { formatDateTime } from "@/core/lifecycle";
import {
  determinationDisplay,
  requirementStatusDisplay,
} from "@/core/display";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { findingsListHref } from "@/core/filters";
import type { Control, Project, Requirement } from "@complyloop/analysis-core/contract/project-types";
import {
  unableToVerifyReason,
  unableToVerifyReasonLabel,
} from "@/core/lifecycle";
import { RequirementRemediationActions } from "./requirement-remediation-actions";
import { RequirementStatusAccent } from "./requirement-status-accent";

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
        isHeuristicCheck: control.checkId
          ? isHeuristicCheck(control.checkId)
          : false,
        isPertinenceTwin: isPertinenceTwinControl(control.id),
      })
      : null;
  const openFindingsHref =
    openCount > 0
      ? findingsListHref({ control: control.id, tab: "open" })
      : null;

  return (
    <Card
      id={`requirement-${control.id}`}
      className="relative scroll-mt-24 overflow-hidden shadow-none transition-[border-color,box-shadow] hover:border-signal/30 focus-within:border-signal/30 focus-within:shadow-sm"
    >
      <RequirementStatusAccent status={requirement.status} />
      <CardHeader className="pb-2 pl-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-mono text-xs text-muted-foreground">
              {control.code}
              {control.secondaryCode ? ` · ${control.secondaryCode}` : ""}
            </p>
            <p className="mt-0.5 font-medium text-foreground">{control.title}</p>
          </div>
          <div
            className="flex flex-wrap items-center gap-2"
            role="group"
            aria-label={`Status: ${requirementStatusDisplay(requirement.status).label}, decided by: ${determinationDisplay(requirement.determination).label}`}
          >
            <RequirementStatusBadge status={requirement.status} />
            <span className="text-xs text-muted-foreground">
              Decided by{" "}
              {determinationDisplay(requirement.determination).label.toLowerCase()}
            </span>
          </div>
        </div>
        {control.description ? (
          <p className="mt-1 text-xs text-muted-foreground">
            {control.description}
          </p>
        ) : null}
        <p className="text-xs text-muted-foreground">
          {openCount > 0 ? (
            openFindingsHref ? (
              <Link
                href={openFindingsHref}
                className="font-medium text-foreground underline underline-offset-4 hover:text-foreground"
              >
                {openCount === 1 ? "1 open finding" : `${openCount} open findings`}
              </Link>
            ) : (
              <>
                {openCount === 1 ? "1 open finding" : `${openCount} open findings`}
              </>
            )
          ) : (
            <>No open findings</>
          )}{" "}
          · updated {formatDateTime(requirement.updatedAt)}
        </p>
      </CardHeader>

      <CardContent className="flex flex-col gap-3 pt-0 pl-5">
        {(requirement.status === "failed" ||
          requirement.status === "needs_review") &&
        openFindingsHref ? (
          <Button size="sm" variant="outline" asChild className="w-fit">
            <Link href={openFindingsHref}>See findings</Link>
          </Button>
        ) : null}

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
                    Set the Preview URL (runtime audit) in Settings
                  </Link>
                </span>
              ) : null}
            </AlertDescription>
          </Alert>
        ) : null}

        <RequirementRemediationActions
          control={control}
          requirement={requirement}
          canRemediate={canRemediate}
        />
      </CardContent>
    </Card>
  );
}
