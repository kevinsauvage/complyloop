import { auth } from "@/auth";
import { CreateOrgForm } from "@/components/create-org-form";
import { InviteMemberForm } from "@/components/invite-member-form";
import { OrgAccountOverview } from "@/components/org-account-overview";
import { OrgDataLifecycle } from "@/components/org-data-lifecycle";
import { OrgMembersCard } from "@/components/org-members-card";
import { EmptyState, PageContent, PageHeader, PageSection } from "@/components/page-primitives";
import { SignInWithGitHubButton } from "@/components/sign-in-with-github-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { getWorkspace } from "@/server/workspace";

export const dynamic = "force-dynamic";

export default async function OrgPage() {
  const session = await auth();
  const userId = session?.user?.id ?? null;

  if (!userId) {
    return (
      <>
        <PageHeader
          title="Organization account"
          description="Sign in with GitHub to manage workspace ownership, members, and data lifecycle."
        />
        <EmptyState
          title="Sign in required"
          action={<SignInWithGitHubButton />}
        >
          Use Sign in with GitHub to create your personal organization and
          invite members by GitHub username.
        </EmptyState>
      </>
    );
  }

  const { organizations, projects, access, activeOrgId } = await getWorkspace();
  const org = activeOrgId
    ? organizations.find((candidate) => candidate.id === activeOrgId)
    : undefined;

  if (!org || !activeOrgId) {
    return (
      <>
        <PageHeader
          title="Organization account"
          description="A personal workspace is created on first sign-in."
        />
        <EmptyState title="No organization yet">
          Reload after signing in — a personal workspace is created
          automatically. If this persists, sign out and sign in again.
        </EmptyState>
      </>
    );
  }

  const members = access.memberships.filter(
    (membership) => membership.orgId === org.id,
  );
  const role = access.memberships.find(
    (membership) =>
      membership.orgId === org.id && membership.userId === userId,
  )?.role;
  const canManage = role === "owner" || role === "admin";
  const owner = members.find((membership) => membership.role === "owner");
  const projectCount = projects.filter(
    (project) => project.orgId === org.id,
  ).length;
  let memberCount = 0;
  let pendingInviteCount = 0;
  for (const membership of members) {
    if (membership.userId) memberCount += 1;
    else pendingInviteCount += 1;
  }
  const supportEmail = process.env.COMPLYLOOP_SUPPORT_EMAIL?.trim() || null;

  return (
    <>
      <PageHeader
        title="Organization account"
        description={`Settings for ${org.name}: ownership, access, retention, and data controls.`}
      >
        {canManage ? (
          <Dialog>
            <DialogTrigger asChild>
              <Button size="sm">
                Invite member
              </Button>
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

      <PageContent>
        <OrgAccountOverview
          orgName={org.name}
          orgSlug={org.slug}
          createdAt={org.createdAt}
          ownerGithubLogin={owner?.githubLogin ?? null}
          viewerRole={role ?? null}
          projectCount={projectCount}
          memberCount={memberCount}
          pendingInviteCount={pendingInviteCount}
          supportEmail={supportEmail}
        />

        <PageSection
          title="Members & access"
          description="Owners and admins control invites and roles. Viewers can read project compliance data."
        >
          <Card className="overflow-hidden shadow-none">
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
        </PageSection>

        {role === "owner" ? (
          <OrgDataLifecycle orgId={org.id} orgName={org.name} />
        ) : null}

        {!canManage ? (
          <Alert className="surface-panel border-border/60 bg-muted/30">
            <AlertDescription>
              Only owners and admins can invite, change roles, or revoke invites
              for this organization. Only the workspace owner can export or
              delete the organization.
            </AlertDescription>
          </Alert>
        ) : null}
      </PageContent>
    </>
  );
}
