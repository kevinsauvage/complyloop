import { allFrameworkPresets } from "@/adapters/registry";
import { StatefulActionForm } from "@/components/stateful-action-form";
import { Badge } from "@/components/ui/badge";
import {
  applyFrameworkPresetAction,
} from "@/server/actions/requirements-intake";
import {
  presetScopeAction,
  type PresetScopeAction,
} from "./preset-scope-action";

const frameworkPresets = allFrameworkPresets();

export function IntakePresetList({
  controlCount,
  inScope,
  hasExplicitScope,
}: {
  controlCount: number;
  inScope: Set<string>;
  hasExplicitScope: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        {hasExplicitScope
          ? `${inScope.size} of ${controlCount} controls are assessed. Presets add to that set.`
          : `All ${controlCount} controls are assessed. Using a subset replaces that with only those controls.`}
      </p>
      <ul className="flex flex-col gap-2">
        {frameworkPresets.map((preset) => {
          const action = presetScopeAction(preset, inScope, hasExplicitScope);
          return (
            <li
              key={preset.id}
              className="flex flex-col gap-2 rounded-lg border border-border/60 bg-muted/30 p-3"
            >
              <div>
                <p className="text-sm font-medium">{preset.name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {preset.description}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs text-muted-foreground">
                  {preset.controlIds.length} controls
                </span>
                {action.kind === "current" ? (
                  <Badge className="border-transparent bg-status-passed/15 text-status-passed dark:bg-status-passed/25">
                    Current scope
                  </Badge>
                ) : null}
                {action.kind === "in_scope" ? (
                  <Badge className="border-transparent bg-status-passed/15 text-status-passed dark:bg-status-passed/25">
                    In scope
                  </Badge>
                ) : null}
                {action.kind === "add" ? (
                  <span className="font-mono text-xs text-muted-foreground">
                    {preset.controlIds.length - action.remaining}/
                    {preset.controlIds.length} in scope
                  </span>
                ) : null}
              </div>
              <PresetApplyForm
                presetId={preset.id}
                presetName={preset.name}
                presetControlCount={preset.controlIds.length}
                action={action}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function PresetApplyForm({
  presetId,
  presetName,
  presetControlCount,
  action,
}: {
  presetId: string;
  presetName: string;
  presetControlCount: number;
  action: PresetScopeAction;
}) {
  switch (action.kind) {
    case "current":
    case "in_scope":
      return null;
    case "narrow":
      return (
        <StatefulActionForm
          action={applyFrameworkPresetAction}
          submitLabel={`Use only ${presetName}`}
          pendingLabel="Applying…"
          variant="secondary"
          size="sm"
          confirmTitle="Replace current scope?"
          confirmMessage={`${presetName} will become the project scope (${action.controlCount} controls). Other controls stay out of assessment until you add them back.`}
        >
          <input type="hidden" name="presetId" value={presetId} />
        </StatefulActionForm>
      );
    case "add":
      return (
        <StatefulActionForm
          action={applyFrameworkPresetAction}
          submitLabel={
            action.remaining < presetControlCount
              ? `Add remaining (${action.remaining})`
              : `Add ${presetName}`
          }
          pendingLabel="Applying…"
          variant="secondary"
          size="sm"
        >
          <input type="hidden" name="presetId" value={presetId} />
        </StatefulActionForm>
      );
    default: {
      const _exhaustive: never = action;
      throw new Error(`Unhandled preset action: ${_exhaustive}`);
    }
  }
}
