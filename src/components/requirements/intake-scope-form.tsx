import { StatefulActionForm } from "@/components/stateful-action-form";
import { Label } from "@/components/ui/label";
import type { Control, Framework } from "@/core/project-types";
import { updateRequirementScopeAction } from "@/server/actions/requirements-intake";

function groupControlsByFramework(
  controls: Control[],
  frameworks: Framework[],
): { framework: Framework; controls: Control[] }[] {
  return frameworks.flatMap((framework) => {
    const grouped = controls.filter(
      (control) => control.frameworkId === framework.id,
    );
    return grouped.length > 0 ? [{ framework, controls: grouped }] : [];
  });
}

export function IntakeScopeForm({
  controls,
  frameworks,
  inScope,
  hasExplicitScope,
}: {
  controls: Control[];
  frameworks: Framework[];
  inScope: Set<string>;
  hasExplicitScope: boolean;
}) {
  const grouped = groupControlsByFramework(controls, frameworks);
  const leftover = controls.filter(
    (control) =>
      !frameworks.some((framework) => framework.id === control.frameworkId),
  );
  const scopeGroups =
    leftover.length > 0
      ? [
          ...grouped,
          {
            framework: {
              id: "unassigned",
              name: "Other controls",
              version: "",
            },
            controls: leftover,
          },
        ]
      : grouped;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Assessment only evaluates checked controls.
        {hasExplicitScope
          ? ` ${inScope.size} of ${controls.length} selected.`
          : ` All ${controls.length} selected.`}
      </p>
      <StatefulActionForm
        action={updateRequirementScopeAction}
        submitLabel="Save scope"
        pendingLabel="Saving…"
        variant="default"
        size="sm"
        className="flex flex-col gap-3"
      >
        <div className="max-h-72 overflow-y-auto rounded-lg border border-border/60 p-1">
          {scopeGroups.map((group) => (
            <fieldset key={group.framework.id} className="min-w-0">
              <legend className="sticky top-0 z-10 bg-card/95 px-2 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur-sm">
                {group.framework.name}
              </legend>
              <ul className="flex flex-col gap-0.5 pb-2">
                {group.controls.map((control) => (
                  <li
                    key={control.id}
                    className="flex items-start gap-2.5 rounded px-2 py-1.5 hover:bg-muted/40"
                  >
                    {/* Native checkbox — Radix Checkbox does not participate in form posts. */}
                    <input
                      id={`scope-${control.id}`}
                      type="checkbox"
                      name="controlId"
                      value={control.id}
                      defaultChecked={inScope.has(control.id)}
                      className="mt-1 size-4 shrink-0 rounded border border-input accent-signal"
                    />
                    <Label
                      htmlFor={`scope-${control.id}`}
                      className="cursor-pointer items-start font-normal"
                    >
                      <span className="font-medium">{control.title}</span>
                      <span className="mt-0.5 block font-mono text-xs text-muted-foreground">
                        {control.code}
                        {control.checkId ? ` · ${control.checkId}` : " · manual"}
                      </span>
                    </Label>
                  </li>
                ))}
              </ul>
            </fieldset>
          ))}
        </div>
      </StatefulActionForm>
    </div>
  );
}
