"use client";

import type { Organization } from "@/core/types";
import { switchOrgAction } from "@/server/actions/org";
import { Label } from "@/components/ui/label";

export function OrgSwitcher({
  organizations,
  activeOrgId,
}: {
  organizations: Organization[];
  activeOrgId: string;
}) {
  if (organizations.length <= 1) return null;

  return (
    <form key={activeOrgId} action={switchOrgAction} className="min-w-0">
      <Label htmlFor="org-switcher" className="sr-only">
        Organization
      </Label>
      <select
        id="org-switcher"
        name="orgId"
        defaultValue={activeOrgId}
        className="h-8 max-w-48 truncate rounded-lg border border-input bg-background px-2.5 text-sm text-foreground shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 dark:bg-input/30"
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
      >
        {organizations.map((org) => (
          <option key={org.id} value={org.id}>
            {org.name}
          </option>
        ))}
      </select>
    </form>
  );
}
