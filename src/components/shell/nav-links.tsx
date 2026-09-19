"use client";

import {
  Building2,
  FileSearch,
  LayoutDashboard,
  ListChecks,
  ScrollText,
  Settings,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import type { NavAttentionCounts } from "@complyloop/db/repo/nav-attention";

import { cn } from "@/lib/utils";

const LINKS = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    badgeKey: "unreadAlerts" as const,
  },
  { href: "/requirements", label: "Requirements", icon: ListChecks },
  {
    href: "/findings",
    label: "Findings",
    icon: FileSearch,
    badgeKey: "openFindings" as const,
  },
  { href: "/evidence", label: "Evidence", icon: ScrollText },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/org", label: "Organization", icon: Building2 },
];

type NavBadgeKey = keyof NavAttentionCounts;

function badgeCount(
  attention: NavAttentionCounts,
  badgeKey: NavBadgeKey | undefined,
): number {
  if (!badgeKey) return 0;
  return attention[badgeKey];
}

function badgeAccessibleLabel(
  label: string,
  count: number,
  badgeKey: NavBadgeKey,
): string {
  if (badgeKey === "openFindings") {
    return `${label}, ${count} open finding${count === 1 ? "" : "s"}`;
  }
  return `${label}, ${count} unread alert${count === 1 ? "" : "s"}`;
}

export function NavLinks({
  navAttention = { openFindings: 0, unreadAlerts: 0 },
}: {
  navAttention?: NavAttentionCounts;
}) {
  const pathname = usePathname();
  return (
    <ul className="flex flex-col gap-1">
      {LINKS.map((link) => {
        const active =
          link.href === "/dashboard"
            ? pathname === "/dashboard"
            : pathname.startsWith(link.href);
        const Icon = link.icon;
        const badgeKey = "badgeKey" in link ? link.badgeKey : undefined;
        const count = badgeCount(navAttention, badgeKey);
        const showBadge = count > 0;
        const badgeLabel =
          showBadge && badgeKey
            ? badgeAccessibleLabel(link.label, count, badgeKey)
            : undefined;
        return (
          <li key={link.href}>
            <Link
              href={link.href}
              aria-current={active ? "page" : undefined}
              aria-label={badgeLabel}
              className={cn(
                "relative flex min-h-11 items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-[background-color,color] duration-150",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-[inset_0_1px_0_0] shadow-foreground/[0.04]"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
              )}
            >
              {active ? (
                <span
                  className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-signal"
                  aria-hidden
                />
              ) : null}
              <Icon
                className={cn(
                  "size-4 shrink-0 transition-colors",
                  active ? "text-signal" : "text-current opacity-80",
                )}
                aria-hidden
              />
              <span className="min-w-0 flex-1">{link.label}</span>
              {showBadge ? (
                <span
                  className={cn(
                    "ml-auto min-w-5 rounded-full px-1.5 py-0.5 text-center text-xs font-semibold tabular-nums",
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
  );
}
