import { StatefulActionForm } from "@/components/stateful-action-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { updateRuntimeAuditAction } from "@/server/actions/runtime-audit";

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
      submitLabel="Save runtime audit"
      pendingLabel="Saving…"
      variant="default"
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="runtimeBaseUrl">Preview / staging URL</Label>
        <Input
          id="runtimeBaseUrl"
          name="runtimeBaseUrl"
          type="url"
          placeholder="https://your-app.vercel.app"
          defaultValue={runtimeBaseUrl ?? ""}
          autoComplete="off"
        />
        <p className="text-xs text-muted-foreground">
          When set, composition-sensitive checks (labels, names, headings…) use
          the rendered page as the source of truth, and runtime-only checks
          (contrast, page title, skip link, landmarks, target size) can be
          assessed. Leave empty for source-only AST assessment.
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
          / staging URL. Empty list defaults to auditing <code className="font-mono">/</code>{" "}
          only. Absolute http(s) URLs are not allowed.
        </p>
      </div>
    </StatefulActionForm>
  );
}
