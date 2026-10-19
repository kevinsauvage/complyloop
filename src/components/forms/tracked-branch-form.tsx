import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateTrackedBranchAction } from "@/server/actions/tracked-branch";

import { StatefulActionForm } from "./stateful-action-form";

export function TrackedBranchForm({
  trackedBranch,
  defaultBranch,
}: {
  trackedBranch?: string;
  defaultBranch: string;
}) {
  return (
    <StatefulActionForm
      action={updateTrackedBranchAction}
      submitLabel="Save tracked branch"
      pendingLabel="Saving…"
      variant="default"
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="trackedBranch">Tracked branch</Label>
        <Input
          id="trackedBranch"
          name="trackedBranch"
          type="text"
          placeholder={defaultBranch}
          defaultValue={trackedBranch ?? ""}
          autoComplete="off"
          spellCheck={false}
          aria-describedby="trackedBranch-hint"
        />
        <p id="trackedBranch-hint" className="text-xs text-muted-foreground">
          The branch ComplyLoop scans and treats as the truth: its pushes and
          deployments are authoritative, and manual runs check it out. Leave
          empty to track the default branch ({defaultBranch}). Set it when the
          Preview URL is built from another branch (for example a{" "}
          <code className="font-mono">develop</code> preview), so the audited
          deployment can match the scanned commit.
        </p>
      </div>
      <p className="text-xs text-muted-foreground">
        Will apply to future assessments only.
      </p>
    </StatefulActionForm>
  );
}
