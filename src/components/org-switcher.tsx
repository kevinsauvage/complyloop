"use client";

import type { Organization } from "@complyloop/analysis-core/contract/project-types";
import { switchOrgAction } from "@/server/actions/org";
import { AutoSubmitSelectForm } from "@/components/auto-submit-select-form";

export function OrgSwitcher({
  organizations,
  activeOrgId,
}: {
  organizations: Organization[];
  activeOrgId: string;
}) {
  return (
    <AutoSubmitSelectForm
      id="org-switcher"
      name="orgId"
      action={switchOrgAction}
      label="Organization"
      defaultValue={activeOrgId}
      className="max-w-48"
      options={organizations.map((org) => ({
        value: org.id,
        label: org.name,
      }))}
    />
  );
}
