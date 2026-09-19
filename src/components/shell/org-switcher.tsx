"use client";

import type { Organization } from "@complyloop/analysis-core/contract/project-types";

import { AutoSubmitSelectForm } from "@/components/forms/auto-submit-select-form";
import { switchOrgAction } from "@/server/actions/org";

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
