import { Badge } from "@/components/ui/badge";
import { STATUS_TONE_BADGE } from "@/core/display";
import type { FrameworkPreset } from "@complyloop/analysis-core/adapters/types";

/**
 * Name + badge + description + control count for one preset row. Wrapper and
 * selection affordance (link, radio, …) are owned by the caller.
 */
export function PresetItemBody({
  preset,
  badgeLabel,
}: {
  preset: FrameworkPreset;
  /** Badge shown when this preset is the org default. */
  badgeLabel?: string;
}) {
  return (
    <span className="min-w-0 flex-1">
      <span className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">{preset.name}</span>
        {badgeLabel ? (
          <Badge className={STATUS_TONE_BADGE.passed}>{badgeLabel}</Badge>
        ) : null}
      </span>
      <span className="mt-0.5 block text-xs text-muted-foreground">
        {preset.description}
      </span>
      <span className="mt-1 block font-mono text-xs text-muted-foreground">
        {preset.controlIds.length} controls
      </span>
    </span>
  );
}