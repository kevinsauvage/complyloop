import { auth } from "@/auth";
import { CreateOrgForm } from "@/components/create-org-form";
import { InviteMemberForm } from "@/components/invite-member-form";
import { OrgDataLifecycle } from "@/components/org-data-lifecycle";
import { OrgMembersCard } from "@/components/org-members-card";
import { EmptyState, PageHeader } from "@/components/page-primitives";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  createOrgAction,
  inviteOrgMemberAction,
} from "@/server/actions/org";
import { membershipsForOrg, userRoleInOrg } from "@/server/orgs";
import { getWorkspace } from "@/server/workspace";

export const dynamic = "force-dynamic";

export default async function OrgPage() {
  const session = await auth();
  const userId = session?.user?.id ?? null;

  if (!userId) {
    return (
      <>
        <PageHeader
          title="Organization"
          description="Sign in with GitHub to manage your workspace and invite teammates."
        />
        <EmptyState title="Sign in required">
          Use Sign in with GitHub in the sidebar to create your personal
          organization and invite members by GitHub username.
        </EmptyState>
      </>
    );
  }

  const { db, activeOrgId } = await getWorkspace();
  const org = activeOrgId
    ? db.organizations.find((candidate) => candidate.id === activeOrgId)
    : undefined;

  if (!org || !activeOrgId) {
    return (
      <>
        <PageHeader title="Organization" />
        <EmptyState title="No organization yet">
          Reload after signing in — a personal workspace is created automatically.
        </EmptyState>
      </>
    );
  }

  const members = membershipsForOrg(db, org.id);
  const role = userRoleInOrg(db, org.id, userId);
  const canManage = role === "owner" || role === "admin";
  const projectCount = db.projects.filter(
    (project) => project.orgId === org.id,
  ).length;
  const pendingInvites = members.filter((membership) => !membership.userId).length;

  return (
    <>
      <PageHeader
        title={org.name}
        description={`Slug ${org.slug} · ${projectCount} project${projectCount === 1 ? "" : "s"} · your role: ${role ?? "none"}${pendingInvites > 0 ? ` · ${pendingInvites} pending invite${pendingInvites === 1 ? "" : "s"}` : ""}`}
      >
        {canManage ? (
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">Invite member</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Invite by GitHub username</DialogTitle>
                <DialogDescription>
                  Teammates claim the invite on their next sign-in when their
                  GitHub login matches.
                </DialogDescription>
              </DialogHeader>
              <InviteMemberForm
                action={inviteOrgMemberAction}
                orgId={org.id}
                canAssignAdmin={role === "owner"}
              />
            </DialogContent>
          </Dialog>
        ) : null}
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">New organization</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create a team organization</DialogTitle>
              <DialogDescription>
                Create a named org, switch to it, then invite teammates. Your
                personal workspace stays available in the switcher.
              </DialogDescription>
            </DialogHeader>
            <CreateOrgForm action={createOrgAction} />
          </DialogContent>
        </Dialog>
      </PageHeader>

      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Members</CardTitle>
            <CardDescription>
              Owners and admins can change roles and revoke pending invites.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <OrgMembersCard
              orgId={org.id}
              members={members}
              currentUserId={userId}
              canManage={canManage}
              canAssignAdmin={role === "owner"}
            />
          </CardContent>
        </Card>

        {role === "owner" ? (
          <OrgDataLifecycle orgId={org.id} orgName={org.name} />
        ) : null}

        {!canManage ? (
          <Alert className="border-border/60 bg-muted/40">
            <AlertDescription>
              Only owners and admins can invite, change roles, or revoke invites
              for this organization.
            </AlertDescription>
          </Alert>
        ) : null}
      </div>
    </>
  );
}
