import { StatefulActionForm } from "@/components/stateful-action-form";
import { formatDateTime } from "@/components/ui";
import type { OrgMembership } from "@/core/types";
import {
  changeOrgMemberRoleAction,
  removeOrgMemberAction,
} from "@/server/actions/org";

const secondaryButton =
  "rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50";

export function OrgMembersCard({
  orgId,
  members,
  currentUserId,
  canManage,
}: {
  orgId: string;
  members: OrgMembership[];
  currentUserId: string;
  canManage: boolean;
}) {
  return (
    <ul className="divide-y divide-zinc-100">
      {members.map((membership) => {
        const isYou = membership.userId === currentUserId;
        const isOwner = membership.role === "owner";
        const pending = !membership.userId;

        return (
          <li
            key={membership.id}
            className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-zinc-900">
                @{membership.githubLogin}
                {isYou ? (
                  <span className="ml-2 text-xs font-normal text-zinc-500">
                    (you)
                  </span>
                ) : null}
              </p>
              <p className="text-xs text-zinc-500">
                {membership.role}
                {pending ? " · invite pending" : " · signed in"}
                {" · "}
                joined {formatDateTime(membership.createdAt)}
              </p>
            </div>

            {canManage && !isOwner ? (
              <div className="flex flex-wrap items-end gap-2">
                <StatefulActionForm
                  action={changeOrgMemberRoleAction}
                  submitLabel="Update role"
                  pendingLabel="Updating…"
                  submitClassName={secondaryButton}
                  className="flex flex-wrap items-end gap-2"
                >
                  <input type="hidden" name="orgId" value={orgId} />
                  <input
                    type="hidden"
                    name="membershipId"
                    value={membership.id}
                  />
                  <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600">
                    Role
                    <select
                      name="role"
                      defaultValue={membership.role}
                      className="rounded-lg border border-zinc-300 px-2 py-1.5 text-xs font-normal text-zinc-800"
                      aria-label={`Role for @${membership.githubLogin}`}
                    >
                      <option value="admin">Admin</option>
                      <option value="member">Member</option>
                      <option value="viewer">Viewer</option>
                    </select>
                  </label>
                </StatefulActionForm>

                <StatefulActionForm
                  action={removeOrgMemberAction}
                  submitLabel={pending ? "Revoke invite" : "Remove"}
                  pendingLabel={pending ? "Revoking…" : "Removing…"}
                  submitClassName={secondaryButton}
                  confirmMessage={
                    pending
                      ? `Revoke the pending invite for @${membership.githubLogin}?`
                      : `Remove @${membership.githubLogin} from the organization?`
                  }
                >
                  <input type="hidden" name="orgId" value={orgId} />
                  <input
                    type="hidden"
                    name="membershipId"
                    value={membership.id}
                  />
                </StatefulActionForm>
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
