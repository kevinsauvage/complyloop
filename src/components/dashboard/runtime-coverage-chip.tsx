import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  runtimeCoverageSummary,
  type RuntimeCoverageSummary,
} from "@/core/runtime-coverage";
import type { AssessmentEngines } from "@/core/finding-types";
import type { Project } from "@/core/project-types";
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

  return (
    <RuntimeCoverageDisplay summary={summary} compact={compact} className={className} />
  );
}

function RuntimeCoverageDisplay({
  summary,
  compact = false,
  className,
}: {
  summary: RuntimeCoverageSummary;
  compact?: boolean;
  className?: string;
}) {
  const tint =
    summary.mode === "source_only"
      ? "border-transparent bg-status-unverifiable/15 text-status-unverifiable dark:bg-status-unverifiable/25"
      : summary.runtimeError
        ? "border-transparent bg-status-failed/15 text-status-failed dark:bg-status-failed/25"
        : "border-transparent bg-status-passed/15 text-status-passed dark:bg-status-passed/25";

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
