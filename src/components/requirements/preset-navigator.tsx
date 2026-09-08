import Link from "next/link";
import { requirementsPageHref } from "@/core/query";
import type { FrameworkPreset } from "@complyloop/adapters/types";
import type { RequirementStatus } from "@complyloop/analysis-core/contract/statuses";
import { PresetItemBody } from "./preset-item-body";
import { cn } from "@/lib/utils";

export function PresetNavigator({
  presets,
  defaultPresetId,
  selectedPresetId,
  statusFilter,
}: {
  presets: readonly FrameworkPreset[];
  defaultPresetId: string;
  selectedPresetId: string;
  statusFilter: RequirementStatus | undefined;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium">Assessment preset</legend>
      <ul className="flex flex-col gap-2">
        {presets.map((preset) => {
          const selected = preset.id === selectedPresetId;
          const isDefault = preset.id === defaultPresetId;
          return (
            <li key={preset.id}>
              <Link
                href={requirementsPageHref({
                  presetId: preset.id,
                  status: statusFilter,
                  defaultPresetId,
                })}
                aria-current={selected ? "true" : undefined}
                className={cn(
                  "flex items-start gap-2.5 rounded-lg border p-3 transition-colors",
                  selected
                    ? "border-signal/50 bg-signal/10 ring-1 ring-signal/40"
                    : "border-border/60 bg-muted/30 hover:bg-accent/40",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 size-4 shrink-0 rounded-full border-2",
                    selected
                      ? "border-signal bg-signal"
                      : "border-muted-foreground/40 bg-background",
                  )}
                  aria-hidden
                />
                <PresetItemBody
                  preset={preset}
                  badgeLabel={isDefault ? "Default" : undefined}
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}
