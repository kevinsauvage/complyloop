"use client";

import { useState } from "react";
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
  frameworkIds,
}: {
  controls: Control[];
  frameworks: Framework[];
  inScope: Set<string>;
  frameworkIds: string[] | undefined;
}) {
  const allFrameworkIds = frameworks.map((f) => f.id);
  // Initialize selectedFrameworkIds: if frameworkIds is undefined, all frameworks are selected
  const [selectedFrameworkIds, setSelectedFrameworkIds] = useState<string[]>(
    frameworkIds === undefined ? allFrameworkIds : [...frameworkIds]
  );
  // Initialize selectedControlIds from the inScope set
  const [selectedControlIds, setSelectedControlIds] = useState<string[]>(
    Array.from(inScope)
  );

  // When framework selection changes, update control selection accordingly
  const handleFrameworkChange = (frameworkId: string) => {
    setSelectedFrameworkIds((prev) => {
      const isSelected = prev.includes(frameworkId);
      let newSelected = prev;
      if (isSelected) {
        newSelected = prev.filter((id) => id !== frameworkId);
      } else {
        newSelected = [...prev, frameworkId];
      }
      // Update control selection: check/uncheck all controls in this framework
      setSelectedControlIds((prevControls) => {
        const frameworkControls = controls
          .filter((c) => c.frameworkId === frameworkId)
          .map((c) => c.id);
        if (isSelected) {
          // Uncheck all controls in this framework
          return prevControls.filter((id) => !frameworkControls.includes(id));
        } else {
          // Check all controls in this framework
          return [...new Set([...prevControls, ...frameworkControls])];
        }
      });
      return newSelected;
    });
  };

  // When control selection changes, just update the control selection
  const handleControlChange = (controlId: string) => {
    setSelectedControlIds((prev) => {
      const isSelected = prev.includes(controlId);
      if (isSelected) {
        return prev.filter((id) => id !== controlId);
      } else {
        return [...prev, controlId];
      }
    });
  };

  // Determine if all frameworks are selected (for the "Select all" toggle)
  const allFrameworksSelected =
    selectedFrameworkIds.length === allFrameworkIds.length &&
    allFrameworkIds.every((id) => selectedFrameworkIds.includes(id));

  // Determine if any framework is selected (for validation)
  const anyFrameworkSelected = selectedFrameworkIds.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          {/* Native checkbox — Radix Checkbox does not participate in form posts. */}
          <input
            id="select-all-frameworks"
            type="checkbox"
            defaultChecked={allFrameworksSelected}
            className="size-4 shrink-0 rounded border border-input accent-signal"
            onChange={(e) => {
              const checked = e.target.checked;
              if (checked) {
                setSelectedFrameworkIds(allFrameworkIds);
                // Check all controls
                setSelectedControlIds(
                  controls.map((c) => c.id)
                );
              } else {
                setSelectedFrameworkIds([]);
                // Uncheck all controls
                setSelectedControlIds([]);
              }
            }}
          />
          <Label htmlFor="select-all-frameworks" className="cursor-pointer">
            Select all frameworks
          </Label>
        </div>
        <p className="text-sm text-muted-foreground">
          {selectedFrameworkIds.length} of {allFrameworkIds.length} frameworks selected
        </p>
        {!anyFrameworkSelected && (
          <p className="text-sm text-destructive">
            Please select at least one framework to assess.
          </p>
        )}
        <div className="max-h-48 overflow-y-auto rounded-lg border border-border/60 p-1">
          {frameworks.map((framework) => (
            <div
              key={framework.id}
              className="flex items-start gap-2.5 rounded px-2 py-1.5 hover:bg-muted/40"
            >
              {/* Native checkbox — Radix Checkbox does not participate in form posts. */}
              <input
                id={`framework-${framework.id}`}
                type="checkbox"
                name="frameworkId"
                value={framework.id}
                defaultChecked={selectedFrameworkIds.includes(framework.id)}
                className="mt-1 size-4 shrink-0 rounded border border-input accent-signal"
                onChange={() => handleFrameworkChange(framework.id)}
              />
              <Label
                htmlFor={`framework-${framework.id}`}
                className="cursor-pointer items-start font-normal"
              >
                <span className="font-medium">{framework.name}</span>
                <span className="mt-0.5 block font-mono text-xs text-muted-foreground">
                  v{framework.version}
                </span>
              </Label>
            </div>
          ))}
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        Assessment only evaluates checked controls.
        All ${controls.length} controls are available for selection.
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
          {groupControlsByFramework(controls, frameworks).map((group) => (
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
                      defaultChecked={selectedControlIds.includes(control.id)}
                      className="mt-1 size-4 shrink-0 rounded border border-input accent-signal"
                      onChange={() => handleControlChange(control.id)}
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
