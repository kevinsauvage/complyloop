import { auth } from "@/auth";
import { CreateOrgForm } from "@/components/create-org-form";
import { InviteMemberForm } from "@/components/invite-member-form";
import { OrgMembersCard } from "@/components/org-members-card";
import { Card, EmptyState, PageHeader } from "@/components/ui";
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
  const pendingInvites = members.filter((membership) => !membership.userId)
    .length;

  return (
    <>
      <PageHeader
        title={org.name}
        description={`Slug ${org.slug} · ${projectCount} project${projectCount === 1 ? "" : "s"} · your role: ${role ?? "none"}${pendingInvites > 0 ? ` · ${pendingInvites} pending invite${pendingInvites === 1 ? "" : "s"}` : ""}`}
      />

      <div className="flex flex-col gap-6">
        <Card title="Members">
          <p className="mb-3 text-sm text-zinc-600">
            Owners and admins can change roles and revoke pending invites.
            Owner transfer is not supported yet.
          </p>
          <OrgMembersCard
            orgId={org.id}
            members={members}
            currentUserId={userId}
            canManage={canManage}
          />
        </Card>

        {canManage ? (
          <Card title="Invite by GitHub username">
            <p className="mb-3 text-sm text-zinc-600">
              Teammates claim the invite on their next sign-in when their GitHub
              login matches. Invites apply to the organization selected above.
            </p>
            <InviteMemberForm action={inviteOrgMemberAction} orgId={org.id} />
          </Card>
        ) : (
          <Card title="Invite">
            <p className="text-sm text-zinc-600">
              Only owners and admins can invite, change roles, or revoke invites
              for this organization.
            </p>
          </Card>
        )}

        <Card title="Create a team organization">
          <p className="mb-3 text-sm text-zinc-600">
            Create a named org, switch to it, then invite teammates. Your
            personal workspace stays available in the switcher.
          </p>
          <CreateOrgForm action={createOrgAction} />
        </Card>
      </div>
    </>
  );
}
