import { Building2 } from "lucide-react";

import { getWorkspace } from "@/server/workspace/workspace";

import { OrgSwitcher } from "./org-switcher";

/**
 * Active organization, shown at the top of the sidebar. Multi-org viewers get
 * the switcher (their only entry point); single-org viewers get a read-only
 * label so the sidebar always says which organization the pages are about.
 * Project navigation lives on `/projects` and in the project tabs, not here.
 */
export async function WorkspaceSwitcher() {
  const { organizations, activeOrgId } = await getWorkspace();
  const active = organizations.find((org) => org.id === activeOrgId);

  if (activeOrgId && organizations.length > 1) {
    return (
      <OrgSwitcher organizations={organizations} activeOrgId={activeOrgId} />
    );
  }
  if (!active) return null;

  return (
    <p
      title={active.name}
      className="flex min-w-0 items-center gap-2 px-3 text-sm text-muted-foreground"
    >
      <Building2 className="size-4 shrink-0" aria-hidden />
      <span className="truncate font-medium text-foreground">
        {active.name}
      </span>
    </p>
  );
}

export function WorkspaceSwitcherSkeleton() {
  return (
    <div
      aria-hidden
      className="mx-3 h-5 animate-pulse rounded bg-sidebar-accent"
    />
  );
}
