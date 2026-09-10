"use client";

import { useState } from "react";

import type { FrameworkPresetSummary } from "@complyloop/analysis-core/adapters/types";

import { PresetItemBody } from "@/components/requirements/preset-item-body";
import { StatefulActionForm } from "@/components/stateful-action-form";
import { Label } from "@/components/ui/label";
import { setDefaultPresetAction } from "@/server/actions/project-preset";

export function DefaultPresetForm({
  presets,
  defaultPresetId,
}: {
  presets: readonly FrameworkPresetSummary[];
  defaultPresetId: string;
}) {
  const [selectedPresetId, setSelectedPresetId] = useState(defaultPresetId);

  return (
    <StatefulActionForm
      action={setDefaultPresetAction}
      submitLabel="Save scope"
      pendingLabel="Saving…"
      variant="default"
      className="flex flex-col gap-4"
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Default framework scope</legend>
        <p className="text-xs text-muted-foreground">
          Used for assessments and as the Requirements page default. Browse
          other framework scopes on Requirements via the URL. Will apply to
          future assessments only.
        </p>
        <ul className="flex flex-col gap-2">
          {presets.map((preset) => (
            <li key={preset.id}>
              <Label
                htmlFor={`default-preset-${preset.id}`}
                className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border/60 bg-muted/30 p-3 font-normal"
              >
                <input
                  id={`default-preset-${preset.id}`}
                  type="radio"
                  name="presetId"
                  value={preset.id}
                  aria-label={`Default scope: ${preset.name}`}
                  checked={preset.id === selectedPresetId}
                  onChange={() => setSelectedPresetId(preset.id)}
                  required
                  className="mt-1 size-4 shrink-0 accent-signal"
                />
                <PresetItemBody
                  preset={preset}
                  badgeLabel={
                    preset.id === defaultPresetId ? "Current" : undefined
                  }
                />
              </Label>
            </li>
          ))}
        </ul>
      </fieldset>
    </StatefulActionForm>
  );
}
