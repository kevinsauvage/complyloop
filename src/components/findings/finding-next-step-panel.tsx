import Link from "next/link";
import { FindingActionPanel } from "@/components/findings/finding-action-panel";
import { PermissionNotice } from "@/components/permission-notice";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { remediationStatusLabel } from "@/core/labels";
import type { Finding, Remediation } from "@/core/finding-types";
import { cn } from "@/lib/utils";

export function FindingNextStepPanel({
  finding,
  remediation,
  canRemediate,
}: {
  finding: Finding;
  remediation: Remediation;
  canRemediate: boolean;
}) {
  const showDismissLink =
    finding.status === "open" &&
    canRemediate &&
    remediation.status !== "verified";

  return (
    <Card
      className={cn(
        "border-signal/30 bg-signal/5 shadow-none ring-1 ring-signal/25",
        "md:sticky md:top-4 md:z-10",
      )}
    >
      <CardHeader className="gap-1 pb-3">
        <CardTitle className="text-base">Next step</CardTitle>
        <CardDescription>
          Current remediation:{" "}
          <span className="font-medium text-foreground">
            {remediationStatusLabel(remediation.status)}
          </span>
          {remediation.status === "implemented" ? (
            <span className="block text-xs">
              Implemented is not verified — run a re-check to close the loop.
            </span>
          ) : null}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 pt-0">
        {!canRemediate && remediation.status !== "verified" ? (
          <PermissionNotice>
            You have view-only access on this project. Ask a member or admin to
            approve, apply, or verify remediations.
          </PermissionNotice>
        ) : (
          <FindingActionPanel
            finding={finding}
            remediation={remediation}
            canRemediate={canRemediate}
          />
        )}
        {showDismissLink ? (
          <p className="text-xs text-muted-foreground">
            Not a real failure?{" "}
            <Link
              href="#dismiss-finding"
              className="underline underline-offset-4 hover:text-foreground"
            >
              Dismiss with a documented reason
            </Link>
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
