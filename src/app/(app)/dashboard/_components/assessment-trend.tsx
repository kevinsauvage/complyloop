import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import { useId } from "react";

import { FormattedDateTime } from "@/components/primitives/formatted-datetime";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

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
    .map((point, index) => `${x(index).toFixed(1)},${y(point.passRate).toFixed(1)}`)
    .join(" ");
  const area = `0,100 ${line} 100,100`;

  const DeltaIcon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;
  const deltaLabel =
    delta > 0 ? `+${delta} pts` : delta < 0 ? `${delta} pts` : "stable";

  return (
    <Card size="sm" className={cn("shadow-none", className)}>
      <CardContent className="flex flex-col gap-3 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Pass rate trend</p>
            <p className="text-xs text-muted-foreground">
              Last {trend.length} assessments
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-xs tabular-nums",
                delta > 0 && "bg-status-passed/15 text-status-passed",
                delta < 0 && "bg-destructive/15 text-destructive",
                delta === 0 && "bg-muted text-muted-foreground",
              )}
            >
              <DeltaIcon className="size-3.5" aria-hidden />
              {deltaLabel}
            </span>
            <span className="font-mono text-2xl font-semibold tabular-nums tracking-tight">
              {last.passRate}%
            </span>
          </div>
        </div>
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="h-24 w-full"
          role="img"
          aria-label={`Pass rate trend: ${first.passRate}% to ${last.passRate}% over ${trend.length} assessments (${deltaLabel})`}
        >
          <defs>
            <linearGradient
              id={gradientId}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
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
              opacity="0.6"
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
            strokeWidth="2.5"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            className="text-chart-2"
          />
        </svg>
        <div className="flex items-baseline justify-between text-xs text-muted-foreground">
          <FormattedDateTime iso={first.at} />
          <FormattedDateTime iso={last.at} />
        </div>
      </CardContent>
    </Card>
  );
}
