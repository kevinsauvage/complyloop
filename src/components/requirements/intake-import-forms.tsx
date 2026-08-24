import { StatefulActionForm } from "@/components/stateful-action-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  importChecklistAction,
  importCustomControlAction,
} from "@/server/actions/requirements-intake";
import { CUSTOM_CHECK_IDS } from "@/server/requirements-intake";

const nativeSelectClassName =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 dark:bg-input/30";

export function IntakeChecklistForm() {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        One control per line. Skip the last fields for a manual control.
      </p>
      <p className="rounded-md bg-muted/50 px-2.5 py-2 font-mono text-xs text-muted-foreground">
        CODE | Title | Description
      </p>
      <StatefulActionForm
        action={importChecklistAction}
        submitLabel="Import checklist"
        pendingLabel="Importing…"
        variant="default"
        size="sm"
        className="flex flex-col gap-3"
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="intake-checklist">Checklist</Label>
          <Textarea
            id="intake-checklist"
            name="checklist"
            required
            rows={5}
            placeholder={
              "CUST-1 | Privacy link present | Marketing pages link to the privacy notice\nCUST-2 | Cookie banner | Consent UI is keyboard accessible"
            }
            className="font-mono text-xs"
          />
        </div>
      </StatefulActionForm>
    </div>
  );
}

export function IntakeCustomControlForm() {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Add one audit or customer control. Link a shipped check to assess it
        automatically.
      </p>
      <StatefulActionForm
        action={importCustomControlAction}
        submitLabel="Import control"
        pendingLabel="Importing…"
        variant="default"
        size="sm"
        className="flex flex-col gap-3"
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="custom-code">Code</Label>
          <Input
            id="custom-code"
            name="code"
            required
            placeholder="e.g. CUST-PRIV-1"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="custom-title">Title</Label>
          <Input
            id="custom-title"
            name="title"
            required
            placeholder="e.g. Privacy link present"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="custom-description">Description</Label>
          <Textarea
            id="custom-description"
            name="description"
            required
            rows={2}
            placeholder="What must be true, in engineer language"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="custom-secondary-code">
            Secondary reference{" "}
            <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id="custom-secondary-code"
            name="secondaryCode"
            placeholder="e.g. customer checklist §3"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="custom-check-id">Assessment</Label>
          <select
            id="custom-check-id"
            name="checkId"
            defaultValue=""
            className={nativeSelectClassName}
          >
            <option value="">Manual — human review</option>
            {CUSTOM_CHECK_IDS.map((checkId) => (
              <option key={checkId} value={checkId}>
                {checkId}
              </option>
            ))}
          </select>
        </div>
      </StatefulActionForm>
    </div>
  );
}
