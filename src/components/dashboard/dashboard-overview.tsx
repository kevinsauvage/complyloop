import Link from "next/link";
import type { ReactNode } from "react";
import { GitBranch } from "lucide-react";
import { PageHeader } from "@/components/page-primitives";
import { cn } from "@/lib/utils";

export type DashboardQuickStat = {
  label: string;
  value: number | string;
  href?: string;
  tone?: "default" | "signal" | "warning" | "success" | "muted";
};

function statToneClass(tone: DashboardQuickStat["tone"]): string {
  switch (tone) {
    case "signal":
      return "border-signal/20 bg-signal/6";
    case "warning":
      return "border-status-failed/20 bg-status-failed/6";
    case "success":
      return "border-status-passed/20 bg-status-passed/6";
    case "muted":
      return "border-border/50 bg-muted/30";
    case "default":
    default:
      return "border-border/60 bg-card/60";
  }
}

function QuickStatTile({ stat }: { stat: DashboardQuickStat }) {
  const inner = (
    <>
      <p
        className={cn(
          "font-mono text-2xl font-semibold tabular-nums tracking-tight",
          stat.tone === "signal" && "text-signal",
          stat.tone === "warning" && "text-status-failed",
          stat.tone === "success" && "text-status-passed",
        )}
      >
        {stat.value}
      </p>
      <p className="mt-1 text-xs font-medium text-muted-foreground">
        {stat.label}
      </p>
    </>
  );

  const className = cn(
    "surface-panel block w-full min-w-0 rounded-xl px-4 py-3 transition-[border-color,background-color] duration-200",
    statToneClass(stat.tone),
    stat.href &&
      "hover:border-signal/30 hover:bg-card/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
  );

  if (stat.href) {
    return (
      <Link href={stat.href} className={className}>
        {inner}
      </Link>
    );
  }

  return <div className={className}>{inner}</div>;
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
  description?: string;
  repoLabel?: string;
  stats: DashboardQuickStat[];
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="surface-panel card-sheen relative overflow-hidden rounded-2xl backdrop-blur-sm">
      <div className="relative z-[1]">
        <PageHeader
          title={title}
          description={description}
          variant="plain"
          eyebrow={
            repoLabel || meta ? (
              <>
                {repoLabel ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/50 px-2.5 py-1 font-mono text-xs text-muted-foreground">
                    <GitBranch className="size-3.5 shrink-0" aria-hidden />
                    {repoLabel}
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
          <ul className="grid grid-cols-2 gap-3 px-5 pb-5 sm:grid-cols-4 sm:px-6 sm:pb-6">
            {stats.map((stat) => (
              <li key={stat.label} className="min-w-0">
                <QuickStatTile stat={stat} />
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}
