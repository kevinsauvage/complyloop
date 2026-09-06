"use client";

import { useState } from "react";
import { StatefulActionForm } from "@/components/stateful-action-form";
import { Badge } from "@/components/ui/badge";
import { STATUS_TONE_BADGE } from "@/core/status-display";
import { Label } from "@/components/ui/label";
import type { FrameworkPreset } from "@complyloop/adapters/types";
import { setDefaultPresetAction } from "@/server/actions/project-preset";

export function DefaultPresetForm({
  presets,
  defaultPresetId,
}: {
  presets: readonly FrameworkPreset[];
  defaultPresetId: string;
}) {
  const [selectedPresetId, setSelectedPresetId] = useState(defaultPresetId);

  return (
    <StatefulActionForm
      action={setDefaultPresetAction}
      submitLabel="Save default preset"
      pendingLabel="Saving…"
      variant="default"
      className="flex flex-col gap-4"
      refreshOnSuccess
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Default assessment preset</legend>
        <p className="text-xs text-muted-foreground">
          Used for assessments and as the Requirements page default. Browse other
          presets on Requirements via the URL.
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
                  checked={preset.id === selectedPresetId}
                  onChange={() => setSelectedPresetId(preset.id)}
                  required
                  className="mt-1 size-4 shrink-0 accent-signal"
                />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{preset.name}</span>
                    {preset.id === defaultPresetId ? (
                      <Badge className={STATUS_TONE_BADGE.passed}>
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
          ))}
        </ul>
      </fieldset>
    </StatefulActionForm>
  );
}
