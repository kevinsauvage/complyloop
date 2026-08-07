"use server";

import { auth } from "@/auth";
import { isOrgRole } from "@/core/rbac";
import type { OrgRole } from "@/core/project-types";
import {
  formError,
  formSuccess,
  readFormString,
  requireFormString,
  runActionMessage,
  type ActionMessageState,
  type FormErrorState,
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
import { getWorkspace, withWorkspaceWrite } from "../workspace";
import { refresh } from "./shared";

export type OrgMemberFormState = FormErrorState;
export type CreateOrgFormState = FormErrorState;

export async function switchOrgAction(formData: FormData): Promise<void> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) throw new Error("Sign in to switch organizations.");

  const orgId = requireFormString(
    formData,
    "orgId",
    "An organization id is required.",
  );

  let projectIdToActivate: string | null = null;
  await withWorkspaceWrite(({ organizations, db }) => {
    if (!organizations.some((org) => org.id === orgId)) {
      throw new Error("You are not a member of that organization.");
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
    const org = await withWorkspaceWrite((workspace) =>
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
    return formError(
      error instanceof Error ? error.message : "Could not create organization.",
    );
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
    await withWorkspaceWrite(({ db }) => {
      if (!canManageOrgMembers(db, orgIdRaw, userId)) {
        throw new Error("Only org owners and admins can invite members.");
      }
      inviteOrgMember(db, orgIdRaw, userId, loginRaw, role);
    });
    refresh();
    return formSuccess(`Invited @${loginRaw.trim()} as ${role}.`);
  } catch (error) {
    return formError(
      error instanceof Error ? error.message : "Invite failed.",
    );
  }
}

export async function removeOrgMemberAction(
  _previous: ActionMessageState,
  formData: FormData,
): Promise<ActionMessageState> {
  return runActionMessage(async () => {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) throw new Error("Sign in to manage organization members.");

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
    await withWorkspaceWrite(({ db }) => {
      if (!canManageOrgMembers(db, orgIdRaw, userId)) {
        throw new Error("Only org owners and admins can remove members.");
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
    if (!userId) throw new Error("Sign in to manage organization members.");

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
      throw new Error("Choose a role: admin, member, or viewer.");
    }
    const role: OrgRole = roleRaw;

    await withWorkspaceWrite(({ db }) => {
      if (!canManageOrgMembers(db, orgIdRaw, userId)) {
        throw new Error("Only org owners and admins can change member roles.");
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
    const payload = exportOrgData(db, orgId, userId);
    return { error: null, json: JSON.stringify(payload, null, 2) };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Could not export organization data.",
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
    if (!userId) throw new Error("Sign in to delete an organization.");

    const orgIdRaw = requireFormString(
      formData,
      "orgId",
      "Organization id is required.",
    );
    if (formData.get("confirm") !== "DELETE") {
      throw new Error('Type DELETE to confirm organization deletion.');
    }

    let nextOrgId: string | undefined;
    await withWorkspaceWrite(({ db }) => {
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
