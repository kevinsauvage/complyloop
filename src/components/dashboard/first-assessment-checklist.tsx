import Link from "next/link";
import { Check } from "lucide-react";
import { PermissionNotice } from "@/components/permission-notice";
import { RuntimeAuditForm } from "@/components/runtime-audit-form";
import { StatefulActionForm } from "@/components/stateful-action-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { presetById, presetCatalog } from "@complyloop/adapters/registry";
import { projectDefaultPresetId } from "@/core/project-preset";
import type { Project } from "@complyloop/domain/project-types";
import { cn } from "@/lib/utils";
import { runAssessmentAction } from "@/server/actions/assessment";

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
          ? "bg-status-passed text-white"
          : optional
            ? "border border-dashed border-border bg-muted/40 text-muted-foreground"
            : "bg-signal/15 text-signal",
      )}
      aria-hidden
    >
      {done ? <Check className="size-4" /> : stepNumber}
    </span>
  );
}

export function FirstAssessmentChecklist({
  project,
  canAssess,
  canConnect,
  hasAssessment,
}: {
  project: Project;
  canAssess: boolean;
  canConnect: boolean;
  hasAssessment: boolean;
}) {
  const defaultPresetId = projectDefaultPresetId(project, presetCatalog);
  const preset = presetById(defaultPresetId);
  const targetDone = Boolean(preset);
  const previewDone = Boolean(project.runtimeBaseUrl?.trim());
  const assessmentDone = hasAssessment;

  const assessAction = canAssess ? (
    <StatefulActionForm
      action={runAssessmentAction}
      submitLabel="Run assessment"
      pendingLabel="Assessing…"
    />
  ) : (
    <PermissionNotice>
      View-only role — you can browse results but not run assessments.
    </PermissionNotice>
  );

  return (
    <Card className="border-border/70 bg-card/80 shadow-none">
      <CardHeader>
        <CardTitle>First assessment checklist</CardTitle>
        <CardDescription>
          Three steps before your dashboard reflects real compliance status for
          &quot;{project.name}&quot;.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <ol className="flex flex-col gap-5">
          <li className="flex gap-3">
            <StepIndicator done={targetDone} stepNumber={1} />
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-sm font-medium">Assessment target</p>
              {targetDone ? (
                <p className="text-sm text-muted-foreground">
                  {preset!.name} — {preset!.controlIds.length} controls.{" "}
                  <Link
                    href="/settings"
                    className="underline underline-offset-4 hover:text-foreground"
                  >
                    Change default
                  </Link>
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Default preset is Full RGAA 4 on connect. Change it in{" "}
                  <Link
                    href="/settings"
                    className="underline underline-offset-4 hover:text-foreground"
                  >
                    Settings
                  </Link>{" "}
                  or browse presets on{" "}
                  <Link
                    href="/requirements"
                    className="underline underline-offset-4 hover:text-foreground"
                  >
                    Requirements
                  </Link>
                  .
                </p>
              )}
            </div>
          </li>

          <li className="flex gap-3">
            <StepIndicator done={previewDone} optional stepNumber={2} />
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
                    ? "Rendered-page checks will run on your preview."
                    : "Source-only for now — contrast, page title, landmarks, and other runtime-only checks stay unable to verify until you add a preview URL."}
                </p>
              </div>
              {canConnect ? (
                <RuntimeAuditForm
                  runtimeBaseUrl={project.runtimeBaseUrl}
                  runtimeRoutes={project.runtimeRoutes}
                />
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
            <StepIndicator done={assessmentDone} stepNumber={3} />
            <div className="min-w-0 flex-1 space-y-2">
              <p className="text-sm font-medium">Run assessment</p>
              <p className="text-sm text-muted-foreground">
                Scan the connected repository against the assessment target.
                {previewDone
                  ? " AST and rendered-page checks will both run."
                  : " AST checks run now; add a preview URL later to unlock runtime checks."}
              </p>
              {!assessmentDone ? assessAction : null}
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
      <p className="rounded-xl border border-status-failed/30 bg-status-failed/10 px-4 py-3 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">Preview audit failed</span>
        {" — "}
        {runtimeError}{" "}
        <Link
          href="/settings"
          className="underline underline-offset-4 hover:text-foreground"
        >
          Check preview URL settings
        </Link>
        . Runtime-only checks stay unable to verify until the preview loads.
      </p>
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
      to assess runtime-only checks (contrast, page title, landmarks, target
      size, and similar). This is a coverage gap, not a pass.
    </p>
  );
}
