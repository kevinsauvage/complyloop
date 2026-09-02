import { PermissionNotice } from "@/components/permission-notice";
import { StatefulActionForm } from "@/components/stateful-action-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { allFrameworkPresets } from "@/adapters/registry";
import { applyFrameworkPresetAction } from "@/server/actions/requirements-intake";

export function RequirementsIntakePanel({
  canAssess,
  currentPresetId,
}: {
  canAssess: boolean;
  currentPresetId: string | undefined;
}) {
  const presets = allFrameworkPresets();

  return (
    <div className="flex flex-col gap-4">
      {!canAssess ? (
        <PermissionNotice>
          View-only role — you can review requirement status but not change the
          assessment target.
        </PermissionNotice>
      ) : null}

      {canAssess ? (
        <Card size="sm" className="shadow-none ring-1 ring-border/60">
          <CardHeader>
            <CardTitle>Intake</CardTitle>
            <CardDescription>
              Choose RGAA 4, or a WCAG 2.2 level.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <StatefulActionForm
              action={applyFrameworkPresetAction}
              submitLabel="Set assessment target"
              pendingLabel="Updating…"
              variant="default"
              size="sm"
              className="flex flex-col gap-3"
              inlineSuccess={false}
              refreshOnSuccess
            >
              <fieldset className="flex flex-col gap-2">
                <legend className="text-sm font-medium">Assessment target</legend>
                <ul className="flex flex-col gap-2">
                  {presets.map((preset) => {
                    const current = preset.id === currentPresetId;
                    return (
                      <li key={preset.id}>
                        <Label
                          htmlFor={`target-${preset.id}`}
                          className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border/60 bg-muted/30 p-3 font-normal"
                        >
                          <input
                            id={`target-${preset.id}`}
                            type="radio"
                            name="presetId"
                            value={preset.id}
                            defaultChecked={current}
                            required
                            className="mt-1 size-4 shrink-0 accent-signal"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-medium">{preset.name}</span>
                              {current ? (
                                <Badge className="border-transparent bg-status-passed/15 text-status-passed dark:bg-status-passed/25">
                                  Current
                                </Badge>
                              ) : null}
                            </span>
                            <span className="mt-0.5 block text-xs text-muted-foreground">
                              {preset.description}
                            </span>
                            <span className="mt-1 block font-mono text-xs text-muted-foreground">
                              {preset.controlIds.length} controls
                            </span>
                          </span>
                        </Label>
                      </li>
                    );
                  })}
                </ul>
              </fieldset>
            </StatefulActionForm>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
