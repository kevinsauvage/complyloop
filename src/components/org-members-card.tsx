import { StatefulActionForm } from "@/components/stateful-action-form";
import { formatDateTime } from "@/components/page-primitives";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { OrgMembership } from "@/core/project-types";
import {
  changeOrgMemberRoleAction,
  removeOrgMemberAction,
} from "@/server/actions/org";

export function OrgMembersCard({
  orgId,
  members,
  currentUserId,
  canManage,
  canAssignAdmin = false,
}: {
  orgId: string;
  members: OrgMembership[];
  currentUserId: string;
  canManage: boolean;
  /** Owners may change/remove admins; admins may not. */
  canAssignAdmin?: boolean;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="pl-4">Member</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Joined</TableHead>
          {canManage ? <TableHead className="text-right pr-4">Actions</TableHead> : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {members.map((membership) => {
          const isYou = membership.userId === currentUserId;
          const isOwner = membership.role === "owner";
          const isAdmin = membership.role === "admin";
          const pending = !membership.userId;
          const canActOnMember =
            !isOwner && (!isAdmin || canAssignAdmin);

          return (
            <TableRow key={membership.id}>
              <TableCell className="pl-4">
                <p className="font-medium">
                  @{membership.githubLogin}
                  {isYou ? (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      (you)
                    </span>
                  ) : null}
                </p>
                <p className="text-xs text-muted-foreground">{membership.role}</p>
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {pending ? "Invite pending" : "Signed in"}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                {formatDateTime(membership.createdAt)}
              </TableCell>
              {canManage ? (
                <TableCell className="pr-4">
                  {canActOnMember ? (
                    <div className="flex flex-wrap items-end justify-end gap-2">
                      <StatefulActionForm
                        action={changeOrgMemberRoleAction}
                        submitLabel="Update role"
                        pendingLabel="Updating…"
                        variant="outline"
                        size="sm"
                        className="flex flex-wrap items-end gap-2"
                      >
                        <input type="hidden" name="orgId" value={orgId} />
                        <input
                          type="hidden"
                          name="membershipId"
                          value={membership.id}
                        />
                        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                          Role
                          <select
                            name="role"
                            defaultValue={
                              membership.role === "admin" && !canAssignAdmin
                                ? "member"
                                : membership.role
                            }
                            aria-label={`Role for @${membership.githubLogin}`}
                            className="h-8 rounded-lg border border-input bg-transparent px-2 py-1 text-xs text-foreground focus-visible:outline-none focus-visible:border-ring"
                          >
                            {canAssignAdmin ? (
                              <option value="admin">Admin</option>
                            ) : null}
                            <option value="member">Member</option>
                            <option value="viewer">Viewer</option>
                          </select>
                        </label>
                      </StatefulActionForm>

                      <StatefulActionForm
                        action={removeOrgMemberAction}
                        submitLabel={pending ? "Revoke invite" : "Remove"}
                        pendingLabel={pending ? "Revoking…" : "Removing…"}
                        variant="destructive"
                        size="sm"
                        confirmMessage={
                          pending
                            ? `Revoke the pending invite for @${membership.githubLogin}?`
                            : `Remove @${membership.githubLogin} from the organization?`
                        }
                        confirmTitle={pending ? "Revoke invite" : "Remove member"}
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
                </TableCell>
              ) : null}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
