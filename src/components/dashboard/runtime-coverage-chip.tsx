import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { runtimeCoverageSummary } from "@/core/assessment";
import { STATUS_TONE_BADGE } from "@/core/status-display";
import type { AssessmentEngines } from "@complyloop/analysis-core/contract/finding-types";
import type { Project } from "@complyloop/analysis-core/contract/project-types";
import { cn } from "@/lib/utils";

export function RuntimeCoverageChip({
  project,
  engines,
  compact = false,
  className,
}: {
  project: Pick<Project, "runtimeBaseUrl">;
  engines?: AssessmentEngines;
  compact?: boolean;
  className?: string;
}) {
  const summary = runtimeCoverageSummary(project, engines);
  const tint =
    summary.mode === "source_only"
      ? STATUS_TONE_BADGE.unverifiable
      : summary.runtimeError
        ? STATUS_TONE_BADGE.failed
        : STATUS_TONE_BADGE.passed;

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <Badge className={cn("rounded-full border-0 font-normal", tint)}>
        {summary.label}
      </Badge>
      {summary.runtimeError ? (
        <span
          className={cn(
            "text-xs text-destructive",
            compact ? "max-w-[min(100%,28rem)] truncate" : undefined,
          )}
          title={compact ? summary.runtimeError : undefined}
        >
          {summary.runtimeError}
        </span>
      ) : null}
      <Link
        href="/settings"
        className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        Edit coverage
      </Link>
    </div>
  );
}
