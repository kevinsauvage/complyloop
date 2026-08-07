"use client";

import type { Organization } from "@/core/types";
import { switchOrgAction } from "@/server/actions/org";

export function OrgSwitcher({
  organizations,
  activeOrgId,
}: {
  organizations: Organization[];
  activeOrgId: string;
}) {
  if (organizations.length <= 1) return null;

  return (
    <form
      key={activeOrgId}
      action={switchOrgAction}
      className="flex flex-wrap items-center gap-2"
    >
      <label className="flex items-center gap-2 text-sm text-zinc-600">
        Organization
        <select
          name="orgId"
          defaultValue={activeOrgId}
          className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
          onChange={(event) => event.currentTarget.form?.requestSubmit()}
        >
          {organizations.map((org) => (
            <option key={org.id} value={org.id}>
              {org.name}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
      >
        Switch
      </button>
    </form>
  );
}
