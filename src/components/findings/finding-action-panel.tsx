import { StatefulActionForm } from "@/components/stateful-action-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Remediation } from "@/core/finding-types";
import { approveRemediationAction } from "@/server/actions/remediation";
import {
  manualVerifyRemediationAction,
  markRemediationImplementedAction,
  verifyRemediationAction,
} from "@/server/actions/remediation-verify";

export function FindingActionPanel({
  findingId,
  remediation,
  canRemediate,
}: {
  findingId: string;
  remediation: Remediation;
  canRemediate: boolean;
}) {
  if (!canRemediate) {
    return null;
  }

  switch (remediation.status) {
    case "detected":
    case "verified":
      return null;
    case "suggested":
      return (
        <StatefulActionForm
          action={approveRemediationAction.bind(null, findingId)}
          submitLabel="Approve remediation"
          variant="default"
        />
      );
    case "approved":
      return (
        <StatefulActionForm
          action={markRemediationImplementedAction.bind(null, findingId)}
          submitLabel="Mark as implemented"
          variant="default"
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
      );
    case "implemented":
      return (
        <div className="flex flex-col gap-3">
          <StatefulActionForm
            action={verifyRemediationAction.bind(null, findingId)}
            submitLabel="Verify fix (automated re-check)"
            pendingLabel="Verifying…"
            variant="default"
          />
          <StatefulActionForm
            action={manualVerifyRemediationAction.bind(null, findingId)}
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
        </div>
      );
    default: {
      const _exhaustive: never = remediation.status;
      throw new Error(`Unhandled remediation status: ${_exhaustive}`);
    }
  }
}
