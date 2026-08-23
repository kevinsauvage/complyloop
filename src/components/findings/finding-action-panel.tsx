import type { ReactNode } from "react";
import { PermissionNotice } from "@/components/permission-notice";
import { StatefulActionForm } from "@/components/stateful-action-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Finding, Remediation } from "@/core/finding-types";
import {
  applyRemediationAction,
  approveRemediationAction,
} from "@/server/actions/remediation";
import {
  manualVerifyRemediationAction,
  markRemediationImplementedAction,
  verifyRemediationAction,
} from "@/server/actions/remediation-verify";

function ActionSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border/70 bg-muted/15 p-4">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
        {description ? (
          <p className="text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export function FindingActionPanel({
  finding,
  remediation,
  canRemediate,
}: {
  finding: Finding;
  remediation: Remediation;
  canRemediate: boolean;
}) {
  if (!canRemediate && remediation.status !== "verified") {
    return (
      <PermissionNotice>
        You have view-only access on this project. Ask a member or admin to
        approve, apply, or verify remediations.
      </PermissionNotice>
    );
  }

  switch (remediation.status) {
    case "detected":
    case "investigating":
      return (
        <ActionSection
          title="Next step"
          description="No automated fix template yet. Generate an AI remediation, fix the code manually, or dismiss with a documented reason."
        >
          <p className="text-sm text-muted-foreground">
            Actions become available once a suggestion is ready for approval.
          </p>
        </ActionSection>
      );
    case "suggested": {
      const editable =
        finding.fix?.kind === "insert_attribute" && finding.fix.editable
          ? finding.fix
          : null;
      return (
        <ActionSection
          title="Approve suggestion"
          description="Human review is required before any change is applied or marked implemented."
        >
          <StatefulActionForm
            action={approveRemediationAction.bind(null, finding.id)}
            submitLabel="Approve remediation"
            variant="default"
            className="flex flex-col gap-3"
          >
            {editable ? (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="approve-value-input">
                  {editable.attribute} value (review before approving)
                </Label>
                <Input
                  id="approve-value-input"
                  type="text"
                  name="value"
                  defaultValue={editable.value}
                  className="max-w-md"
                />
              </div>
            ) : null}
          </StatefulActionForm>
        </ActionSection>
      );
    }
    case "approved":
      return (
        <div className="flex flex-col gap-3">
          {finding.fix ? (
            <ActionSection
              title="Apply to workspace"
              description="Writes the approved fix into the project checkout on disk."
            >
              <StatefulActionForm
                action={applyRemediationAction.bind(null, finding.id)}
                submitLabel="Apply change to the file"
                pendingLabel="Applying…"
                variant="default"
                confirmMessage="Apply this change to the project file on disk? This writes to the workspace."
              />
            </ActionSection>
          ) : null}
          <ActionSection
            title="Mark implemented externally"
            description="Use when the fix landed outside ComplyLoop (PR, local edit, etc.)."
          >
            <StatefulActionForm
              action={markRemediationImplementedAction.bind(null, finding.id)}
              submitLabel="Mark as implemented"
              variant="outline"
              className="flex flex-col gap-2"
            >
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="mark-implemented-note">Implementation note</Label>
                <Input
                  id="mark-implemented-note"
                  type="text"
                  name="note"
                  placeholder="e.g. Fixed in PR #42"
                  className="max-w-md"
                />
              </div>
            </StatefulActionForm>
          </ActionSection>
        </div>
      );
    case "implemented":
      return (
        <div className="flex flex-col gap-3">
          <ActionSection
            title="Automated verification"
            description="Re-run the deterministic check. Only a passing re-check (or recorded human verification) closes the loop."
          >
            <StatefulActionForm
              action={verifyRemediationAction.bind(null, finding.id)}
              submitLabel="Verify fix (automated re-check)"
              pendingLabel="Verifying…"
              variant="default"
            />
          </ActionSection>
          <ActionSection
            title="Manual verification"
            description="Use when the automated check cannot confirm the fix. A note is kept as evidence."
          >
            <StatefulActionForm
              action={manualVerifyRemediationAction.bind(null, finding.id)}
              submitLabel="Verify manually"
              variant="outline"
              className="flex flex-col gap-3"
            >
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="manual-verify-note">Verification note</Label>
                <Textarea
                  id="manual-verify-note"
                  name="note"
                  required
                  rows={2}
                  className="max-w-md"
                />
              </div>
            </StatefulActionForm>
          </ActionSection>
        </div>
      );
    case "verified":
      return (
        <ActionSection title="Verified">
          <p className="text-sm font-medium text-status-passed">
            {finding.resolvedNote ??
              "Fix verified: the automated check no longer fails on this file."}
          </p>
        </ActionSection>
      );
    default: {
      const _exhaustive: never = remediation.status;
      throw new Error(`Unhandled remediation status: ${_exhaustive}`);
    }
  }
}
