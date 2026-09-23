import { ArrowUpRight, GitBranch } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { PageHeader } from "@/components/primitives/page-primitives";
import { cn } from "@/lib/utils";

export type DashboardQuickStat = {
  label: string;
  value: number | string;
  href?: Route;
  tone?: "default" | "signal" | "warning" | "review" | "success" | "muted";
};

function statToneClass(tone: DashboardQuickStat["tone"]): string {
  switch (tone) {
    case "signal":
      return "text-signal";
    case "warning":
      return "text-status-failed";
    case "review":
      return "text-status-review";
    case "success":
      return "text-status-passed";
    case "muted":
      return "text-muted-foreground";
    case "default":
    default:
      return "text-foreground";
  }
}

function QuickStatItem({ stat }: { stat: DashboardQuickStat }) {
  const linked = Boolean(stat.href);
  const inner = (
    <>
      <p
        className={cn(
          "flex items-center gap-1 font-mono text-2xl font-semibold tabular-nums tracking-tight",
          statToneClass(stat.tone),
          linked && "group-hover:text-signal",
        )}
      >
        <span className="min-w-0 truncate">{stat.value}</span>
        {linked ? (
          <ArrowUpRight className="size-4 shrink-0 opacity-60" aria-hidden />
        ) : null}
      </p>
      <p
        className={cn(
          "mt-1 text-xs font-medium text-muted-foreground",
          linked && "underline decoration-dotted underline-offset-4",
        )}
      >
        {stat.label}
      </p>
    </>
  );

  const className =
    "group block min-w-0 flex-1 px-4 py-3 first:pl-5 last:pr-5 sm:first:pl-6 sm:last:pr-6 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";

  if (stat.href) {
    return (
      <Link
        href={stat.href}
        className={className}
        aria-label={`${stat.label}: ${stat.value}. View details`}
      >
        {inner}
      </Link>
    );
  }

  return <div className={cn(className, "cursor-default")}>{inner}</div>;
}

export function DashboardOverview({
  title,
  description,
  repoLabel,
  stats,
  meta,
  actions,
}: {
  title: string;
  description?: ReactNode;
  repoLabel?: string;
  stats: DashboardQuickStat[];
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="surface-panel relative rounded-xl">
      <div>
        <PageHeader
          title={title}
          description={description}
          variant="plain"
          eyebrow={
            repoLabel || meta ? (
              <>
                {repoLabel && repoLabel !== title ? (
                  <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border/60 bg-background/50 px-2.5 py-1 font-mono text-xs text-muted-foreground">
                    <GitBranch className="size-3.5 shrink-0" aria-hidden />
                    <span className="min-w-0 truncate">{repoLabel}</span>
                  </span>
                ) : null}
                {meta}
              </>
            ) : undefined
          }
        >
          {actions}
        </PageHeader>
        {stats.length > 0 ? (
          <ul
            aria-label="Key compliance metrics"
            className="flex flex-col divide-y divide-border/60 border-t border-border/60 sm:flex-row sm:divide-x sm:divide-y-0"
          >
            {stats.map((stat) => (
              <li key={stat.label} className="min-w-0 flex-1">
                <QuickStatItem stat={stat} />
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}
