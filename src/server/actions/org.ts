"use server";

import { auth } from "@/auth";
import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import { isOrgRole } from "@/core/rbac";
import type { OrgRole } from "@/core/project-types";
import {
  actionErrorState,
  formError,
  formSuccess,
  publicErrorMessage,
  readFormString,
  requireFormString,
  runActionMessage,
  type ActionMessageState,
} from "../action-state";
import {
  writeActiveOrgCookie,
  writeActiveProjectCookie,
} from "../active-cookies";
import {
  canManageOrgMembers,
  changeOrgMemberRole,
  createOrganization,
  deleteOrganization,
  exportOrgData,
  inviteOrgMember,
  removeOrgMember,
  resolveActiveOrgId,
} from "../orgs";
import { getDrizzle } from "../db-store/client";
import { listAllEvidenceForProjects } from "../db-store/postgres-queries";
import { getWorkspace, withOrgWrite } from "../workspace";
import { refresh } from "./shared";

export type OrgMemberFormState = ActionMessageState;
export type CreateOrgFormState = ActionMessageState;

export async function switchOrgAction(formData: FormData): Promise<void> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) throw new PublicError("Sign in to switch organizations.");

  const orgId = requireFormString(
    formData,
    "orgId",
    "An organization id is required.",
  );

  let projectIdToActivate: string | null = null;
  await withOrgWrite(({ organizations, db }) => {
    if (!organizations.some((org) => org.id === orgId)) {
      throw new PublicError("You are not a member of that organization.");
    }
    const projectInOrg = db.projects.find((project) => project.orgId === orgId);
    if (projectInOrg) {
      projectIdToActivate = projectInOrg.id;
    }
  });
  await writeActiveOrgCookie(orgId);
  if (projectIdToActivate) {
    await writeActiveProjectCookie(projectIdToActivate);
  }
  refresh();
}

export async function createOrgAction(
  _previous: CreateOrgFormState,
  formData: FormData,
): Promise<CreateOrgFormState> {
  const session = await auth();
  const userId = session?.user?.id;
  const githubLogin = session?.user?.login;
  if (!userId || !githubLogin) {
    return formError("Sign in with GitHub to create an organization.");
  }

  const nameRaw = readFormString(formData, "name");
  if (nameRaw == null || nameRaw.trim().length === 0) {
    return formError("Enter an organization name.");
  }

  try {
    const org = await withOrgWrite((workspace) =>
      createOrganization(workspace.db, {
        name: nameRaw,
        creatorUserId: userId,
        githubLogin,
      }),
    );
    await writeActiveOrgCookie(org.id);
    refresh();
    return formSuccess(`Created organization "${org.name}".`);
  } catch (error) {
    return actionErrorState(error);
  }
}

export async function inviteOrgMemberAction(
  _previous: OrgMemberFormState,
  formData: FormData,
): Promise<OrgMemberFormState> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return formError("Sign in to manage organization members.");

  const orgIdRaw = readFormString(formData, "orgId");
  const loginRaw = readFormString(formData, "githubLogin");
  const roleRaw = formData.get("role");
  if (orgIdRaw == null) {
    return formError("Select an organization.");
  }
  if (loginRaw == null || loginRaw.trim().length === 0) {
    return formError("Enter a GitHub username.");
  }
  if (!isOrgRole(roleRaw) || roleRaw === "owner") {
    return formError("Choose a role: admin, member, or viewer.");
  }
  const role: OrgRole = roleRaw;

  try {
    await withOrgWrite(({ db }) => {
      if (!canManageOrgMembers(db, orgIdRaw, userId)) {
        throw new PublicError("Only org owners and admins can invite members.");
      }
      inviteOrgMember(db, orgIdRaw, userId, loginRaw, role);
    });
    refresh();
    return formSuccess(`Invited @${loginRaw.trim()} as ${role}.`);
  } catch (error) {
    return actionErrorState(error);
  }
}

export async function removeOrgMemberAction(
  _previous: ActionMessageState,
  formData: FormData,
): Promise<ActionMessageState> {
  return runActionMessage(async () => {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) throw new PublicError("Sign in to manage organization members.");

    const orgIdRaw = requireFormString(
      formData,
      "orgId",
      "Organization id is required.",
    );
    const membershipId = requireFormString(
      formData,
      "membershipId",
      "Membership id is required.",
    );

    let revokedInvite = false;
    await withOrgWrite(({ db }) => {
      if (!canManageOrgMembers(db, orgIdRaw, userId)) {
        throw new PublicError("Only org owners and admins can remove members.");
      }
      const target = db.memberships.find(
        (membership) =>
          membership.id === membershipId && membership.orgId === orgIdRaw,
      );
      revokedInvite = Boolean(target && !target.userId);
      removeOrgMember(db, orgIdRaw, userId, membershipId);
    });
    refresh();
    return revokedInvite ? "Invite revoked." : "Member removed.";
  });
}

export async function changeOrgMemberRoleAction(
  _previous: ActionMessageState,
  formData: FormData,
): Promise<ActionMessageState> {
  return runActionMessage(async () => {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) throw new PublicError("Sign in to manage organization members.");

    const orgIdRaw = requireFormString(
      formData,
      "orgId",
      "Organization id is required.",
    );
    const membershipId = requireFormString(
      formData,
      "membershipId",
      "Membership id is required.",
    );
    const roleRaw = formData.get("role");
    if (!isOrgRole(roleRaw) || roleRaw === "owner") {
      throw new PublicError("Choose a role: admin, member, or viewer.");
    }
    const role: OrgRole = roleRaw;

    await withOrgWrite(({ db }) => {
      if (!canManageOrgMembers(db, orgIdRaw, userId)) {
        throw new PublicError("Only org owners and admins can change member roles.");
      }
      changeOrgMemberRole(db, orgIdRaw, userId, membershipId, role);
    });
    refresh();
    return `Role updated to ${role}.`;
  });
}

export async function exportOrgDataAction(
  orgId: string,
): Promise<{ error: string | null; json: string | null }> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return { error: "Sign in to export organization data.", json: null };
  }
  try {
    const { db } = await getWorkspace();
    const projectIds = db.projects
      .filter((project) => project.orgId === orgId)
      .map((project) => project.id);
    const evidence = await listAllEvidenceForProjects(
      await getDrizzle(),
      projectIds,
    );
    const payload = exportOrgData({ ...db, evidence }, orgId, userId);
    return { error: null, json: JSON.stringify(payload, null, 2) };
  } catch (error) {
    return {
      error: publicErrorMessage(error),
      json: null,
    };
  }
}

export async function deleteOrgAction(
  _previous: ActionMessageState,
  formData: FormData,
): Promise<ActionMessageState> {
  return runActionMessage(async () => {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) throw new PublicError("Sign in to delete an organization.");

    const orgIdRaw = requireFormString(
      formData,
      "orgId",
      "Organization id is required.",
    );
    if (formData.get("confirm") !== "DELETE") {
      throw new PublicError('Type DELETE to confirm organization deletion.');
    }

    let nextOrgId: string | undefined;
    await withOrgWrite(({ db }) => {
      deleteOrganization(db, orgIdRaw, userId);
      nextOrgId = resolveActiveOrgId(db, userId, null);
    });
    if (nextOrgId) {
      await writeActiveOrgCookie(nextOrgId);
    }
    refresh();
    return "Organization deleted. Evidence history was retained for audit.";
  });
}
