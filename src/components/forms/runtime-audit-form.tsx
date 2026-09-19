import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { updateRuntimeAuditAction } from "@/server/actions/runtime-audit";

import { StatefulActionForm } from "./stateful-action-form";

export function RuntimeAuditForm({
  runtimeBaseUrl,
  runtimeRoutes,
}: {
  runtimeBaseUrl?: string;
  runtimeRoutes?: string[];
}) {
  return (
    <StatefulActionForm
      action={updateRuntimeAuditAction}
      submitLabel="Save preview URL"
      pendingLabel="Saving…"
      variant="default"
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="runtimeBaseUrl">Preview URL (runtime audit)</Label>
        <Input
          id="runtimeBaseUrl"
          name="runtimeBaseUrl"
          type="url"
          placeholder="https://your-app.vercel.app"
          defaultValue={runtimeBaseUrl ?? ""}
          autoComplete="off"
          aria-describedby="runtimeBaseUrl-hint"
        />
        <p id="runtimeBaseUrl-hint" className="text-xs text-muted-foreground">
          When set, checks that need the live page (contrast, page title, skip
          link, landmarks, target size) can run, and shared checks use the page
          as the source of truth. Leave empty for code-only assessment.
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="runtimeRoutes">Routes (one per line)</Label>
        <Textarea
          id="runtimeRoutes"
          name="runtimeRoutes"
          rows={3}
          placeholder={"/\n/pricing"}
          defaultValue={(runtimeRoutes ?? ["/"]).join("\n")}
          aria-describedby="runtimeRoutes-hint"
        />
        <p id="runtimeRoutes-hint" className="text-xs text-muted-foreground">
          One path per line (e.g. <code className="font-mono">/</code>,{" "}
          <code className="font-mono">/pricing</code>); relative to the Preview
          URL (runtime audit). A missing leading{" "}
          <code className="font-mono">/</code> is added automatically. Empty
          list defaults to auditing <code className="font-mono">/</code> only.
          Absolute http(s) URLs are not allowed.
        </p>
      </div>
      <p className="text-xs text-muted-foreground">
        Will apply to future assessments only.
      </p>
    </StatefulActionForm>
  );
}
