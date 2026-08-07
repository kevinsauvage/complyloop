"use server";

import { auth } from "@/auth";
import { isOrgRole } from "@/core/rbac";
import type { OrgRole } from "@/core/types";
import {
  runActionMessage,
  type ActionMessageState,
} from "../action-state";
import { writeActiveOrgCookie } from "../active-org";
import { writeActiveProjectCookie } from "../active-project";
import {
  canManageOrgMembers,
  createOrganization,
  inviteOrgMember,
  removeOrgMember,
} from "../orgs";
import { withWorkspaceWrite } from "../workspace";
import { refresh } from "./shared";

export type OrgMemberFormState = {
  error: string | null;
};

export type CreateOrgFormState = {
  error: string | null;
};

export async function switchOrgAction(formData: FormData): Promise<void> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) throw new Error("Sign in to switch organizations.");

  const orgId = formData.get("orgId");
  if (typeof orgId !== "string" || orgId.length === 0) {
    throw new Error("An organization id is required.");
  }

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
    return { error: "Sign in with GitHub to create an organization." };
  }

  const nameRaw = formData.get("name");
  if (typeof nameRaw !== "string" || nameRaw.trim().length === 0) {
    return { error: "Enter an organization name." };
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
    return { error: null };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Could not create organization.",
    };
  }
}

export async function inviteOrgMemberAction(
  _previous: OrgMemberFormState,
  formData: FormData,
): Promise<OrgMemberFormState> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { error: "Sign in to manage organization members." };

  const orgIdRaw = formData.get("orgId");
  const loginRaw = formData.get("githubLogin");
  const roleRaw = formData.get("role");
  if (typeof orgIdRaw !== "string" || orgIdRaw.length === 0) {
    return { error: "Select an organization." };
  }
  if (typeof loginRaw !== "string" || loginRaw.trim().length === 0) {
    return { error: "Enter a GitHub username." };
  }
  if (!isOrgRole(roleRaw) || roleRaw === "owner") {
    return { error: "Choose a role: admin, member, or viewer." };
  }

  try {
    await withWorkspaceWrite(({ db }) => {
      if (!canManageOrgMembers(db, orgIdRaw, userId)) {
        throw new Error("Only org owners and admins can invite members.");
      }
      inviteOrgMember(db, orgIdRaw, userId, loginRaw, roleRaw as OrgRole);
    });
    refresh();
    return { error: null };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Invite failed.",
    };
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

    const orgIdRaw = formData.get("orgId");
    const membershipId = formData.get("membershipId");
    if (typeof orgIdRaw !== "string" || orgIdRaw.length === 0) {
      throw new Error("Organization id is required.");
    }
    if (typeof membershipId !== "string" || membershipId.length === 0) {
      throw new Error("Membership id is required.");
    }

    await withWorkspaceWrite(({ db }) => {
      if (!canManageOrgMembers(db, orgIdRaw, userId)) {
        throw new Error("Only org owners and admins can remove members.");
      }
      removeOrgMember(db, orgIdRaw, userId, membershipId);
    });
    refresh();
    return "Member removed.";
  });
}
