import { PermissionNotice } from "@/components/permission-notice";
import { StatefulActionForm } from "@/components/stateful-action-form";
import type { Finding, Remediation } from "@/core/types";
import {
  applyRemediationAction,
  approveRemediationAction,
  manualVerifyRemediationAction,
  markRemediationImplementedAction,
  verifyRemediationAction,
} from "@/server/actions/remediation";
import { primaryButton, secondaryButton } from "./finding-styles";

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
        <p className="text-sm text-zinc-500">
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
          submitClassName={primaryButton}
          className="flex flex-col gap-3"
        >
          {editable ? (
            <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700">
              {editable.attribute} value (review before approving)
              <input
                type="text"
                name="value"
                defaultValue={editable.value}
                className="w-full max-w-md rounded-lg border border-zinc-300 px-3 py-2 text-sm font-normal"
              />
            </label>
          ) : null}
        </StatefulActionForm>
      );
    }
    case "approved":
      return (
        <div className="flex flex-col gap-3">
          {finding.fix ? (
            <StatefulActionForm
              action={applyRemediationAction.bind(null, finding.id)}
              submitLabel="Apply change to the file"
              pendingLabel="Applying…"
              submitClassName={primaryButton}
              confirmMessage="Apply this change to the project file on disk? This writes to the workspace."
            />
          ) : null}
          <StatefulActionForm
            action={markRemediationImplementedAction.bind(null, finding.id)}
            submitLabel="Mark as implemented"
            submitClassName={secondaryButton}
            className="flex flex-col gap-2"
          >
            <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700">
              Or mark implemented (applied outside ComplyLoop)
              <input
                type="text"
                name="note"
                placeholder="e.g. Fixed in PR #42"
                className="w-full max-w-md rounded-lg border border-zinc-300 px-3 py-2 text-sm font-normal"
              />
            </label>
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
            submitClassName={primaryButton}
          />
          <StatefulActionForm
            action={manualVerifyRemediationAction.bind(null, finding.id)}
            submitLabel="Verify manually"
            submitClassName={secondaryButton}
            className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-3"
          >
            <p className="text-sm text-zinc-600">
              Manual verification — use when the automated check cannot confirm
              the fix (or after verifying by other means). Requires a note.
            </p>
            <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700">
              Verification note
              <textarea
                name="note"
                required
                rows={2}
                className="w-full max-w-md rounded-lg border border-zinc-300 px-3 py-2 text-sm font-normal"
              />
            </label>
          </StatefulActionForm>
        </div>
      );
    case "verified":
      return (
        <p className="text-sm font-medium text-emerald-700">
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
