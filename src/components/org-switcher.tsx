"use client";

import type { Organization } from "@complyloop/analysis-core/contract/project-types";
import { switchOrgAction } from "@/server/actions/org";
import { Label } from "@/components/ui/label";
import { nativeSelectClass } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";

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
        className={cn(nativeSelectClass, "max-w-48 truncate")}
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
