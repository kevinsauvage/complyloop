import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import { useId } from "react";

import { FormattedDateTime } from "@/components/primitives/formatted-datetime";
import { cn } from "@/lib/utils";

/**
 * Pass-rate sparkline for the snapshot panel. Rendered bare (no card) so it
 * reads as the second half of the snapshot rather than a nested surface.
 */
export function AssessmentTrend({
  trend,
  className,
}: {
  trend: ReadonlyArray<{ at: string; passRate: number }>;
  className?: string;
}) {
  const gradientId = useId().replace(/:/g, "");
  if (trend.length < 2) return null;
  const first = trend[0]!;
  const last = trend[trend.length - 1]!;
  const delta = last.passRate - first.passRate;

  // Dynamic domain keeps small moves visible; flat lines get padding so the
  // area still renders instead of collapsing to zero height.
  const rates = trend.map((point) => point.passRate);
  const lo = Math.max(0, Math.min(...rates) - 8);
  const hi = Math.min(100, Math.max(...rates) + 8);
  const span = Math.max(hi - lo, 1);
  const x = (index: number) => (index / (trend.length - 1)) * 100;
  const y = (rate: number) => ((hi - rate) / span) * 100;
  const line = trend
    .map(
      (point, index) =>
        `${x(index).toFixed(1)},${y(point.passRate).toFixed(1)}`,
    )
    .join(" ");
  const area = `0,100 ${line} 100,100`;

  const DeltaIcon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;
  const deltaLabel =
    delta > 0 ? `+${delta} pts` : delta < 0 ? `${delta} pts` : "stable";
  const deltaDescription =
    delta > 0
      ? `Up ${delta} points`
      : delta < 0
        ? `Down ${Math.abs(delta)} points`
        : "No change";

  return (
    <div className={cn("flex h-full flex-col gap-3", className)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Pass rate trend</p>
          <p className="text-xs text-muted-foreground">
            Last {trend.length} assessments
          </p>
        </div>
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 font-mono text-xs tabular-nums",
            delta > 0 && "bg-status-passed/15 text-status-passed",
            delta < 0 && "bg-destructive/15 text-destructive",
            delta === 0 && "bg-muted text-muted-foreground",
          )}
        >
          <DeltaIcon className="size-3.5" aria-hidden />
          {deltaLabel}
          <span className="sr-only"> {deltaDescription}</span>
        </span>
      </div>
      <div className="relative mt-1 min-h-24 flex-1 pr-1.5">
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 size-full"
          role="img"
          aria-label={`Pass rate trend: ${first.passRate}% to ${last.passRate}% over ${trend.length} assessments (${deltaDescription.toLowerCase()})`}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.25" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[25, 50, 75].map((gy) => (
            <line
              key={gy}
              x1="0"
              y1={gy}
              x2="100"
              y2={gy}
              stroke="currentColor"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
              className="text-border"
              opacity="0.5"
            />
          ))}
          <polygon
            points={area}
            fill={`url(#${gradientId})`}
            className="text-chart-2"
          />
          <polyline
            points={line}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            className="text-chart-2"
          />
        </svg>
        {/* Marker lives outside the SVG so non-uniform scaling keeps it round. */}
        <span
          aria-hidden
          className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-chart-2 ring-4 ring-card"
          style={{ left: "100%", top: `${y(last.passRate)}%` }}
        />
      </div>
      <div className="mt-auto flex items-baseline justify-between gap-3 text-xs text-muted-foreground">
        <FormattedDateTime iso={first.at} />
        <FormattedDateTime iso={last.at} />
      </div>
    </div>
  );
}
