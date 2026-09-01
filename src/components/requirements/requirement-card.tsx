import Link from "next/link";
import { isRuntimeOnlyCheck } from "@/analysis/check-authority";
import { DeterminationBadge, RequirementStatusBadge } from "@/components/badges";
import { formatDateTime } from "@/components/page-primitives";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { findingsListHref } from "@/core/finding-list-filter";
import type { Control, Project, Requirement } from "@/core/project-types";
import {
  unableToVerifyReason,
  unableToVerifyReasonLabel,
} from "@/core/unable-to-verify-reason";
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
        })
      : null;
  const openFindingsHref =
    openCount > 0
      ? findingsListHref({ control: control.id, tab: "open" })
      : null;

  return (
    <Card className="relative overflow-hidden shadow-none ring-1 ring-border/60 transition-[box-shadow,border-color] hover:ring-signal/30">
      <RequirementStatusAccent status={requirement.status} />
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
          {openFindingsHref ? (
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
          )}{" "}
          · updated {formatDateTime(requirement.updatedAt)}
        </p>
      </CardHeader>

      <CardContent className="flex flex-col gap-3 pt-0 pl-5">
        {requirement.status === "failed" && openFindingsHref ? (
          <Button size="sm" asChild>
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
                    Set preview URL in Settings
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
