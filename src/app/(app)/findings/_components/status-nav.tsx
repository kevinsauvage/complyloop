import Link from "next/link";
import type { ReactNode } from "react";

import {
  type FindingListParams,
  findingsListHref,
  type FindingsTab,
} from "@/core/filter-params";
import { cn } from "@/lib/utils";

function tabHref(tab: FindingsTab, params: FindingListParams): string {
  return findingsListHref({ ...params, tab, page: 1 });
}

function StatusNavLink({
  href,
  current,
  children,
}: {
  href: string;
  current: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={cn(
        "rounded-md px-3 py-1 text-sm font-medium whitespace-nowrap outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
        current
          ? "bg-background text-foreground shadow-sm ring-1 ring-border"
          : "text-foreground/60",
      )}
    >
      {children}
    </Link>
  );
}

export function FindingsStatusNav({
  listParams,
  activeTab,
  totals,
}: {
  listParams: FindingListParams;
  activeTab: FindingsTab;
  totals: { open: number; byCause: number; resolved: number; dismissed: number };
}) {
  return (
    <nav
      aria-label="Findings"
      className="surface-panel flex w-full items-center gap-1 overflow-x-auto rounded-xl p-1"
    >
      <StatusNavLink href={tabHref("open", listParams)} current={activeTab === "open"}>
        Open ({totals.open})
      </StatusNavLink>
      <StatusNavLink
        href={tabHref("by_cause", listParams)}
        current={activeTab === "by_cause"}
      >
        Root cause ({totals.byCause})
      </StatusNavLink>
      <StatusNavLink
        href={tabHref("resolved", listParams)}
        current={activeTab === "resolved"}
      >
        Resolved ({totals.resolved})
      </StatusNavLink>
      <StatusNavLink
        href={tabHref("dismissed", listParams)}
        current={activeTab === "dismissed"}
      >
        Dismissed ({totals.dismissed})
      </StatusNavLink>
    </nav>
  );
}
