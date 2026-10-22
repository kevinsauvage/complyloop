"use client";

import {
  ChevronRight,
  FileSearch,
  FolderGit2,
  LayoutDashboard,
  ListChecks,
  ScrollText,
  Settings,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import type { NavAttentionCounts } from "@complyloop/db/repo/nav-attention";

import { PROJECT_TABS, projectPath, type ProjectTab } from "@/core/routes";
import { cn } from "@/lib/utils";

interface ProjectTabMeta {
  label: string;
  icon: typeof LayoutDashboard;
  badgeKey?: keyof NavAttentionCounts;
}

const TAB_META: Record<ProjectTab, ProjectTabMeta> = {
  dashboard: {
    label: "Dashboard",
    icon: LayoutDashboard,
    badgeKey: "unreadAlerts",
  },
  requirements: { label: "Requirements", icon: ListChecks },
  findings: {
    label: "Findings",
    icon: FileSearch,
    badgeKey: "openFindings",
  },
  evidence: { label: "Evidence", icon: ScrollText },
  settings: { label: "Settings", icon: Settings },
};

export function badgeAccessibleLabel(
  label: string,
  count: number,
  badgeKey: keyof NavAttentionCounts,
): string {
  const noun =
    badgeKey === "openFindings"
      ? `open finding${count === 1 ? "" : "s"}`
      : `unread alert${count === 1 ? "" : "s"}`;
  // Keep the visible text (`${label} ${count}`) as a contiguous substring of
  // the accessible name so the link satisfies WCAG 2.5.3 (label in name).
  return `${label} ${count} ${noun}`;
}

/**
 * Project-level navigation: a header naming the project plus a tab bar for the
 * pages that act on it. Rendered by the project layout, so it only ever appears
 * on project-scoped routes.
 */
export function ProjectNav({
  projectId,
  project,
  navAttention = { openFindings: 0, unreadAlerts: 0 },
}: {
  projectId: string;
  project: { name: string; repo?: string | null } | null;
  navAttention?: NavAttentionCounts;
}) {
  const pathname = usePathname();
  if (!project) return null;

  return (
    <div className="mb-6 space-y-3">
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <Link
          href="/projects"
          className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          Overview
        </Link>
        <ChevronRight
          className="size-3.5 shrink-0 text-muted-foreground/60"
          aria-hidden
        />
        <span className="flex min-w-0 items-center gap-2 font-medium text-foreground">
          <FolderGit2 className="size-4 shrink-0 text-signal" aria-hidden />
          <span className="truncate">{project.name}</span>
        </span>
        {project.repo && project.repo !== project.name ? (
          <span className="truncate font-mono text-xs text-muted-foreground">
            {project.repo}
          </span>
        ) : null}
      </div>
      <nav
        aria-label="Project"
        className="-mx-4 overflow-x-auto border-b border-border px-4 sm:mx-0 sm:px-0"
      >
        <ul className="flex min-w-max gap-1">
          {PROJECT_TABS.map((tab) => {
            const href = projectPath(projectId, tab);
            const active = pathname === href || pathname.startsWith(`${href}/`);
            const { label, icon: Icon, badgeKey } = TAB_META[tab];
            const count = badgeKey ? navAttention[badgeKey] : 0;
            return (
              <li key={tab}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  aria-label={
                    count > 0 && badgeKey
                      ? badgeAccessibleLabel(label, count, badgeKey)
                      : undefined
                  }
                  className={cn(
                    "relative -mb-px flex min-h-11 items-center gap-2 border-b-2 px-3 text-sm font-medium transition-colors",
                    active
                      ? "border-signal text-foreground"
                      : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
                  )}
                >
                  <Icon
                    className={cn("size-4 shrink-0", active && "text-signal")}
                    aria-hidden
                  />
                  {label}
                  {count > 0 ? (
                    <span
                      className={cn(
                        "min-w-5 rounded-full px-1.5 py-0.5 text-center text-xs font-semibold tabular-nums",
                        active
                          ? "bg-signal text-signal-foreground"
                          : "bg-signal/15 text-signal",
                      )}
                      aria-hidden
                    >
                      {count > 99 ? "99+" : count}
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

/** Fallback while the project name and badge counts load. */
export function ProjectNavSkeleton() {
  return (
    <div role="status" aria-label="Loading project navigation" className="mb-6">
      <span className="sr-only">Loading project navigation…</span>
      <div aria-hidden className="space-y-3">
        <div className="h-5 w-48 animate-pulse rounded bg-sidebar-accent" />
        <div className="flex h-11 gap-3 border-b border-border">
          {PROJECT_TABS.map((tab) => (
            <span
              key={tab}
              className="my-3 h-5 w-24 animate-pulse rounded bg-sidebar-accent"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
