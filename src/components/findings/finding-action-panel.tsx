import { PermissionNotice } from "@/components/permission-notice";
import { StatefulActionForm } from "@/components/stateful-action-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Finding, Remediation } from "@/core/types";
import {
  applyRemediationAction,
  approveRemediationAction,
  manualVerifyRemediationAction,
  markRemediationImplementedAction,
  verifyRemediationAction,
} from "@/server/actions/remediation";

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
        <p className="text-sm text-muted-foreground">
          No automated fix template yet. Generate an AI remediation suggestion,
          fix the code manually, or dismiss the finding with a documented reason.
        </p>
      );
    case "suggested": {
      const editable =
        finding.fix?.kind === "insert_attribute" && finding.fix.editable
          ? finding.fix
          : null;
      return (
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
      );
    }
    case "approved":
      return (
        <div className="flex flex-col gap-4">
          {finding.fix ? (
            <StatefulActionForm
              action={applyRemediationAction.bind(null, finding.id)}
              submitLabel="Apply change to the file"
              pendingLabel="Applying…"
              variant="default"
              confirmMessage="Apply this change to the project file on disk? This writes to the workspace."
            />
          ) : null}
          <StatefulActionForm
            action={markRemediationImplementedAction.bind(null, finding.id)}
            submitLabel="Mark as implemented"
            variant="outline"
            className="flex flex-col gap-2"
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="mark-implemented-note">
                Or mark implemented (applied outside ComplyLoop)
              </Label>
              <Input
                id="mark-implemented-note"
                type="text"
                name="note"
                placeholder="e.g. Fixed in PR #42"
                className="max-w-md"
              />
            </div>
          </StatefulActionForm>
        </div>
      );
    case "implemented":
      return (
        <div className="flex flex-col gap-4">
          <StatefulActionForm
            action={verifyRemediationAction.bind(null, finding.id)}
            submitLabel="Verify fix (automated re-check)"
            pendingLabel="Verifying…"
            variant="default"
          />
          <StatefulActionForm
            action={manualVerifyRemediationAction.bind(null, finding.id)}
            submitLabel="Verify manually"
            variant="outline"
            className="flex flex-col gap-3 rounded-xl border border-border p-4"
          >
            <p className="text-sm text-muted-foreground">
              Manual verification — use when the automated check cannot confirm
              the fix (or after verifying by other means). Requires a note.
            </p>
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
        </div>
      );
    case "verified":
      return (
        <p className="text-sm font-medium text-emerald-400">
          {finding.resolvedNote ??
            "Fix verified: the automated check no longer fails on this file."}
        </p>
      );
    default: {
      const _exhaustive: never = remediation.status;
      throw new Error(`Unhandled remediation status: ${_exhaustive}`);
    }
  }
}
