import { StatefulActionForm } from "@/components/stateful-action-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
      variant="outline"
      className="flex flex-col gap-3"
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="runtimeBaseUrl">Preview / staging URL (runtime audit)</Label>
        <Input
          id="runtimeBaseUrl"
          name="runtimeBaseUrl"
          type="url"
          placeholder="https://your-app.vercel.app"
          defaultValue={runtimeBaseUrl ?? ""}
          autoComplete="off"
        />
        <p className="text-xs text-muted-foreground">
          When set, composition-sensitive checks (labels, names, headings…) use the
          rendered page as the source of truth. Leave empty for source-only AST
          assessment.
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="runtimeRoutes">Routes (one per line)</Label>
        <textarea
          id="runtimeRoutes"
          name="runtimeRoutes"
          rows={3}
          className="flex min-h-[72px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          placeholder={"/\n/login"}
          defaultValue={(runtimeRoutes ?? ["/"]).join("\n")}
        />
      </div>
    </StatefulActionForm>
  );
}
