import { auth } from "@/auth";
import { CreateOrgForm } from "@/components/create-org-form";
import { InviteMemberForm } from "@/components/invite-member-form";
import { OrgSwitcher } from "@/components/org-switcher";
import { StatefulActionForm } from "@/components/stateful-action-form";
import { Card, EmptyState, PageHeader, formatDateTime } from "@/components/ui";
import {
  createOrgAction,
  inviteOrgMemberAction,
  removeOrgMemberAction,
} from "@/server/actions";
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

  const { db, organizations, activeOrgId } = await getWorkspace();
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

  return (
    <>
      <PageHeader
        title={org.name}
        description={`Slug ${org.slug} · ${projectCount} project${projectCount === 1 ? "" : "s"} · your role: ${role ?? "none"}`}
      />

      <div className="mb-6 flex flex-wrap items-center gap-4">
        <OrgSwitcher organizations={organizations} activeOrgId={activeOrgId} />
      </div>

      <div className="flex flex-col gap-6">
        <Card title="Members">
          <ul className="divide-y divide-zinc-100">
            {members.map((membership) => (
              <li
                key={membership.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div>
                  <p className="text-sm font-medium text-zinc-900">
                    @{membership.githubLogin}
                    {membership.userId === userId ? (
                      <span className="ml-2 text-xs font-normal text-zinc-500">
                        (you)
                      </span>
                    ) : null}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {membership.role}
                    {membership.userId
                      ? " · signed in"
                      : " · invite pending"}
                    {" · "}
                    joined {formatDateTime(membership.createdAt)}
                  </p>
                </div>
                {canManage && membership.role !== "owner" ? (
                  <StatefulActionForm
                    action={removeOrgMemberAction}
                    submitLabel="Remove"
                    pendingLabel="Removing…"
                    submitClassName="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                  >
                    <input type="hidden" name="orgId" value={org.id} />
                    <input
                      type="hidden"
                      name="membershipId"
                      value={membership.id}
                    />
                  </StatefulActionForm>
                ) : null}
              </li>
            ))}
          </ul>
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
              Only owners and admins can invite or remove members for this
              organization.
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
