import { cache } from "react";
import { NavLinks } from "@/components/nav-links";
import {
  navAttentionForProject,
  type NavAttentionCounts,
} from "@/server/nav-attention";
import { getWorkspace } from "@/server/workspace";

const EMPTY: NavAttentionCounts = { openFindings: 0, unreadAlerts: 0 };

/**
 * Request-memoized badge counts. The AppShell renders this slot twice
 * (desktop sidebar + mobile sheet), so both instances share one query.
 */
const loadNavAttention = cache(async (): Promise<NavAttentionCounts> => {
  const { project } = await getWorkspace();
  if (!project) return EMPTY;
  return navAttentionForProject(project);
});

/**
 * Async badge source — render inside `<Suspense>` so the shell and route
 * content stream first instead of waiting on the counts query.
 */
export async function NavAttentionBadges() {
  const counts = await loadNavAttention();
  return <NavLinks navAttention={counts} />;
}

const SKELETON_ROWS = [
  { label: "Dashboard", badge: true },
  { label: "Requirements", badge: false },
  { label: "Findings", badge: true },
  { label: "Evidence", badge: false },
  { label: "Settings", badge: false },
  { label: "Organization", badge: false },
];

/**
 * Fallback while badge counts load. Mirrors the nav row layout with small
 * pulse dots where the count badges appear (badge: min-w-5 rounded-full
 * px-1.5 py-0.5 text-xs). Global reduced-motion CSS stills the pulse.
 */
export function NavBadgeSkeletons() {
  return (
    <ul className="flex flex-col gap-1" role="status" aria-label="Loading navigation">
      <span className="sr-only">Loading navigation…</span>
      {SKELETON_ROWS.map((row) => (
        <li
          key={row.label}
          aria-hidden
          className="flex min-h-11 items-center gap-2.5 rounded-lg px-3 py-2"
        >
          <span className="size-4 shrink-0 animate-pulse rounded bg-sidebar-accent" />
          <span className="h-4 min-w-0 flex-1 animate-pulse rounded bg-sidebar-accent" />
          {row.badge ? (
            <span className="ml-auto min-w-5 animate-pulse rounded-full bg-sidebar-accent px-1.5 py-0.5 text-center text-xs">
              &nbsp;
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
