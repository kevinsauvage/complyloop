import type { OrgMembership } from "@complyloop/analysis-core/contract/project-types";

import { StatefulActionForm } from "@/components/forms/stateful-action-form";
import { FormattedDateTime } from "@/components/primitives/formatted-datetime";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { roleTone, STATUS_TONE_BADGE } from "@/core/display";
import { cn } from "@/lib/utils";
import {
  changeOrgMemberRoleAction,
  leaveOrgMemberAction,
  removeOrgMemberAction,
} from "@/server/actions/org";

import { RoleSelect } from "./role-select";

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
  const isMember = members.some(
    (membership) => membership.userId === currentUserId,
  );
  return (
    <>
      <Table className="min-w-[40rem]">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="pl-4">Member</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="hidden sm:table-cell">Joined</TableHead>
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
              <TableRow key={membership.id} className="hover:bg-accent/30">
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
                <TableCell className="hidden whitespace-nowrap text-xs text-muted-foreground sm:table-cell">
                  <FormattedDateTime iso={membership.createdAt} />
                </TableCell>
                {canManage ? (
                  <TableCell className="pr-4">
                    {isAdmin && !canAssignAdmin ? (
                      <p className="text-xs text-muted-foreground">
                        Admin (managed by owner)
                      </p>
                    ) : canActOnMember ? (
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
                          <label
                            htmlFor={`role-${membership.id}`}
                            className="flex flex-col gap-1 text-xs font-medium text-muted-foreground"
                          >
                            Role
                            <RoleSelect
                              id={`role-${membership.id}`}
                              name="role"
                              defaultValue={membership.role}
                              canAssignAdmin={canAssignAdmin}
                              ariaLabel={`Role for @${membership.githubLogin}`}
                              className="h-8 rounded-lg border border-input bg-transparent px-2 py-1 text-xs text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 dark:bg-input/30"
                            />
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
                    ) : (
                      <span aria-label="No actions available">—</span>
                    )}
                  </TableCell>
                ) : null}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {isMember ? (
        <div className="mt-4 flex justify-end">
          <StatefulActionForm
            action={leaveOrgMemberAction}
            submitLabel="Leave organization"
            pendingLabel="Leaving…"
            variant="outline"
            size="sm"
            confirmTitle="Leave organization"
            confirmMessage="Leave this organization? You will lose access to its projects (a manager can re-invite you)."
          >
            <input type="hidden" name="orgId" value={orgId} />
          </StatefulActionForm>
        </div>
      ) : null}
    </>
  );
}
