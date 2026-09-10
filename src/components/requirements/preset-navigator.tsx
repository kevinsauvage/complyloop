import Link from "next/link";
import { Check } from "lucide-react";
import { requirementsPageHref } from "@/core/filters";
import type { FrameworkPresetSummary } from "@complyloop/analysis-core/adapters/types";
import type { RequirementStatus } from "@complyloop/analysis-core/contract/statuses";
import { PresetItemBody } from "./preset-item-body";
import { cn } from "@/lib/utils";

export function PresetNavigator({
  presets,
  defaultPresetId,
  selectedPresetId,
  statusFilter,
  q,
}: {
  presets: readonly FrameworkPresetSummary[];
  defaultPresetId: string;
  selectedPresetId: string;
  statusFilter: RequirementStatus | undefined;
  q?: string;
}) {
  return (
    <nav aria-label="Framework scope" className="flex flex-col gap-2">
      <p className="text-sm font-medium">Framework scope</p>
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
                  q,
                  defaultPresetId,
                })}
                aria-current={selected ? "page" : undefined}
                className={cn(
                  "flex items-start gap-2.5 rounded-lg border p-3 transition-colors",
                  selected
                    ? "border-signal/50 bg-signal/10 ring-1 ring-signal/40"
                    : "border-border/60 bg-muted/30 hover:bg-accent/40",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border-2",
                    selected
                      ? "border-signal bg-signal text-signal-foreground"
                      : "border-muted-foreground/40 bg-background text-transparent",
                  )}
                  aria-hidden
                >
                  <Check className="size-3" />
                </span>
                <PresetItemBody
                  preset={preset}
                  badgeLabel={isDefault ? "Default" : undefined}
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
