import { Check } from "lucide-react";
import Link from "next/link";

import type { Project } from "@complyloop/analysis-core/contract/project-types";

import { AssessmentRunForm } from "@/components/dashboard/assessment-run-form";
import { PermissionNotice } from "@/components/permission-notice";
import { RuntimeAuditForm } from "@/components/runtime-audit-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

function StepIndicator({
  done,
  optional,
  stepNumber,
}: {
  done: boolean;
  optional?: boolean;
  stepNumber: number;
}) {
  return (
    <span
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
        done
          ? "bg-status-passed text-status-passed-foreground"
          : optional
            ? "border border-dashed border-border bg-muted/40 text-muted-foreground"
            : "bg-signal/15 text-signal",
      )}
    >
      {done ? <Check className="size-4" aria-hidden /> : stepNumber}
      <span className="sr-only">
        {done
          ? "Completed"
          : optional
            ? `Optional step ${stepNumber}`
            : `Step ${stepNumber}`}
      </span>
    </span>
  );
}

export function FirstAssessmentChecklist({
  project,
  canAssess,
  canConnect,
}: {
  project: Project;
  canAssess: boolean;
  canConnect: boolean;
}) {
  const previewDone = Boolean(project.runtimeBaseUrl?.trim());

  const assessAction = canAssess ? (
    <AssessmentRunForm projectId={project.id} />
  ) : (
    <PermissionNotice>
      View-only role — you can browse results but not run assessments.
    </PermissionNotice>
  );

  return (
    <Card className="border-border/70 shadow-none">
      <CardHeader>
        <CardTitle>First assessment checklist</CardTitle>
        <CardDescription>
          Two steps before your dashboard reflects real compliance status for
          &quot;{project.name}&quot;.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <ol className="flex flex-col gap-5">
          <li className="flex gap-3">
            <StepIndicator done={previewDone} optional stepNumber={1} />
            <div className="min-w-0 flex-1 space-y-3">
              <div className="space-y-1">
                <p className="text-sm font-medium">
                  Preview URL{" "}
                  <span className="font-normal text-muted-foreground">
                    (optional)
                  </span>
                </p>
                <p className="text-sm text-muted-foreground">
                  {previewDone
                    ? "Live-page checks will run on your preview."
                    : "Add a preview URL so contrast, page title, landmarks, and other live-page checks can verify. Without one, the assessment is code-only."}
                </p>
              </div>
              {previewDone ? (
                <p className="text-xs font-medium text-status-passed">
                  Preview URL set — live-page checks will run.
                </p>
              ) : canConnect ? (
                <details className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
                  <summary className="cursor-pointer text-sm font-medium hover:text-foreground">
                    Set a preview URL to unlock live-page checks
                  </summary>
                  <div className="mt-3">
                    <RuntimeAuditForm
                      runtimeBaseUrl={project.runtimeBaseUrl}
                      runtimeRoutes={project.runtimeRoutes}
                    />
                  </div>
                </details>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Ask an admin to set a preview URL in{" "}
                  <Link
                    href="/settings"
                    className="underline underline-offset-4 hover:text-foreground"
                  >
                    Settings
                  </Link>
                  .
                </p>
              )}
            </div>
          </li>

          <li className="flex gap-3">
            <StepIndicator done={false} stepNumber={2} />
            <div className="min-w-0 flex-1 space-y-2">
              <p className="text-sm font-medium">Run assessment</p>
              <p className="text-sm text-muted-foreground">
                Scan the connected repository for compliance gaps. The run
                queues and the worker picks it up — progress appears in the
                Pipeline below.
                {previewDone
                  ? " Code and live-page checks will both run."
                  : " Code checks run now; add a preview URL above to unlock live-page checks."}
              </p>
              {assessAction}
            </div>
          </li>
        </ol>
      </CardContent>
    </Card>
  );
}

export function UnableToVerifyRuntimeHint({
  count,
  hasPreviewUrl,
  runtimeError,
}: {
  count: number;
  hasPreviewUrl: boolean;
  runtimeError?: string | null;
}) {
  if (runtimeError) {
    return (
      <div className="rounded-xl border border-status-failed/30 bg-status-failed/10 px-4 py-3 text-sm">
        <p className="text-foreground">
          <span className="font-medium">Preview audit failed</span>
          {" — "}
          <span className="text-muted-foreground">
            the page didn&apos;t load for automated checks.{" "}
            <Link
              href="/settings"
              className="underline underline-offset-4 hover:text-foreground"
            >
              Check preview URL settings
            </Link>
            . Live-page checks stay unable to verify until the preview loads.
          </span>
        </p>
        <details className="mt-2">
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
            Technical details
          </summary>
          <p className="mt-1 font-mono text-xs break-all text-muted-foreground">
            {runtimeError}
          </p>
        </details>
      </div>
    );
  }

  if (count === 0 || hasPreviewUrl) return null;

  return (
    <p className="rounded-xl border border-status-unverifiable/30 bg-status-unverifiable/10 px-4 py-3 text-sm text-muted-foreground">
      <span className="font-medium text-foreground">
        {count} requirement{count === 1 ? "" : "s"} unable to verify
      </span>{" "}
      — set a{" "}
      <Link
        href="/settings"
        className="underline underline-offset-4 hover:text-foreground"
      >
        preview URL
      </Link>{" "}
      to assess live-page checks (contrast, page title, landmarks, target size,
      and similar). This is a coverage gap, not a pass.
    </p>
  );
}
