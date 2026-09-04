import { StatefulActionForm } from "@/components/stateful-action-form";
import { formatDateTime } from "@/components/page-primitives";
import { Badge } from "@/components/ui/badge";
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
import { STATUS_TONE_BADGE, roleTone } from "@/core/status-tone";
import { cn } from "@/lib/utils";

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
        <TableRow className="hover:bg-transparent">
          <TableHead className="pl-4">Member</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Joined</TableHead>
          {canManage ? (
            <TableHead className="pr-4 text-right">Actions</TableHead>
          ) : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {members.map((membership) => {
          const isYou = membership.userId === currentUserId;
          const isOwner = membership.role === "owner";
          const isAdmin = membership.role === "admin";
          const pending = !membership.userId;
          const canActOnMember = !isOwner && (!isAdmin || canAssignAdmin);

          return (
            <TableRow
              key={membership.id}
              className="hover:bg-accent/30"
            >
              <TableCell className="pl-4">
                <p className="font-medium">
                  @{membership.githubLogin}
                  {isYou ? (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      (you)
                    </span>
                  ) : null}
                </p>
              </TableCell>
              <TableCell>
                <Badge
                  className={cn(
                    "capitalize",
                    STATUS_TONE_BADGE[roleTone(membership.role)],
                  )}
                >
                  {membership.role}
                </Badge>
              </TableCell>
              <TableCell>
                {pending ? (
                  <Badge className={STATUS_TONE_BADGE.review}>
                    Invite pending
                  </Badge>
                ) : (
                  <Badge className={STATUS_TONE_BADGE.passed}>
                    Signed in
                  </Badge>
                )}
              </TableCell>
              <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
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
                            className="h-8 rounded-lg border border-input bg-transparent px-2 py-1 text-xs text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 dark:bg-input/30"
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
                        confirmTitle={
                          pending ? "Revoke invite" : "Remove member"
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
                </TableCell>
              ) : null}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
