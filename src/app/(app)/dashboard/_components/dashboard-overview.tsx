import { ArrowUpRight, GitBranch } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type DashboardQuickStat = {
  label: string;
  value: number | string;
  href?: Route;
  tone?:
    | "default"
    | "signal"
    | "warning"
    | "review"
    | "success"
    | "muted"
    | "unverifiable";
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
    case "unverifiable":
      return "text-status-unverifiable";
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
      <span
        className={cn(
          "flex items-baseline gap-1 font-mono text-2xl font-semibold tabular-nums tracking-tight",
          statToneClass(stat.tone),
          linked && "group-hover:text-signal",
        )}
      >
        <span className="min-w-0 truncate">{stat.value}</span>
        {linked ? (
          <ArrowUpRight
            className="size-3.5 shrink-0 self-center opacity-0 transition-opacity group-hover:opacity-70 group-focus-visible:opacity-70 pointer-coarse:opacity-50"
            aria-hidden
          />
        ) : null}
      </span>
      <span className="mt-0.5 block text-xs font-medium text-muted-foreground">
        {stat.label}
      </span>
    </>
  );

  const className =
    "group flex h-full min-w-0 flex-col justify-center px-4 py-3 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-5";

  if (stat.href) {
    return (
      <Link
        href={stat.href}
        className={cn(className, "transition-colors hover:bg-accent/20")}
        aria-label={`${stat.label}: ${stat.value}. View details`}
      >
        {inner}
      </Link>
    );
  }

  return <div className={cn(className, "cursor-default")}>{inner}</div>;
}

/**
 * Compact project header: identity on the left, actions on the right, key
 * metrics on a single hairline-separated strip. Reading order is
 * what → where → how bad → what to do, so no region needs to out-shout the
 * others to be found.
 */
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
    <section className="surface-panel relative overflow-hidden rounded-xl">
      <div className="flex flex-col gap-4 p-5 sm:p-6 lg:flex-row lg:items-start lg:justify-between lg:gap-8">
        <div className="min-w-0 space-y-2">
          {repoLabel || meta ? (
            <div className="flex flex-wrap items-center gap-2">
              {repoLabel && repoLabel !== title ? (
                <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border/60 bg-background/50 px-2.5 py-1 font-mono text-xs text-muted-foreground">
                  <GitBranch className="size-3.5 shrink-0" aria-hidden />
                  <span className="min-w-0 truncate">{repoLabel}</span>
                </span>
              ) : null}
              {meta}
            </div>
          ) : null}
          <h1
            tabIndex={-1}
            className="text-2xl font-semibold tracking-tight outline-none focus-visible:ring-2 focus-visible:ring-ring/50 sm:text-3xl"
          >
            {title}
          </h1>
          {description ? (
            <p className="max-w-2xl text-sm text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-start gap-2 lg:max-w-sm lg:justify-end">
            {actions}
          </div>
        ) : null}
      </div>
      {stats.length > 0 ? (
        <ul
          aria-label="Key compliance metrics"
          className="grid grid-cols-2 border-t border-border/60 sm:grid-cols-4"
        >
          {stats.map((stat, index) => (
            <li
              key={stat.label}
              // Two columns on phones, four from sm: vertical rules only on
              // the 4-up layout, hairline rules inside the 2-up block.
              className={cn(
                "min-w-0 border-border/60",
                index > 0 && "border-l-0 max-sm:[&:nth-child(even)]:border-l",
                "max-sm:[&:nth-child(n+3)]:border-t",
                "sm:border-l sm:first:border-l-0",
              )}
            >
              <QuickStatItem stat={stat} />
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
