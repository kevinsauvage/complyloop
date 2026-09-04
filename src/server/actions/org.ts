"use server";

import { z } from "zod";
import { auth } from "@/auth";
import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import { entityIdSchema, requiredField } from "@/core/boundary";
import {
  actionErrorState,
  formError,
  formSuccess,
  publicErrorMessage,
  runActionMessage,
  type ActionMessageState,
} from "../action-state";
import { parseForm, parseFormState, parseInput } from "../boundary";
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
import { refresh, requireSignedIn } from "./shared";

export type OrgMemberFormState = ActionMessageState;
export type CreateOrgFormState = ActionMessageState;

const switchOrgInput = z.object({
  orgId: requiredField("An organization id is required."),
});

const createOrgInput = z.object({
  name: requiredField("Enter an organization name.", 200),
});

const inviteOrgMemberInput = z.object({
  orgId: requiredField("Select an organization."),
  githubLogin: requiredField("Enter a GitHub username.", 39),
  role: z.enum(["admin", "member", "viewer"], {
    error: "Choose a role: admin, member, or viewer.",
  }),
});

const orgMembershipInput = z.object({
  orgId: requiredField("Organization id is required."),
  membershipId: requiredField("Membership id is required."),
});

const changeOrgMemberRoleInput = orgMembershipInput.extend({
  role: z.enum(["admin", "member", "viewer"], {
    error: "Choose a role: admin, member, or viewer.",
  }),
});

const deleteOrgInput = z.object({
  orgId: requiredField("Organization id is required."),
  confirm: z.literal("DELETE", {
    error: "Type DELETE to confirm organization deletion.",
  }),
});

export async function switchOrgAction(formData: FormData): Promise<void> {
  const { orgId } = parseForm(switchOrgInput, formData);
  await requireSignedIn("Sign in to switch organizations.");

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

  const parsed = parseFormState(createOrgInput, formData);
  if (!parsed.ok) return parsed.state;

  try {
    const org = await withOrgWrite((workspace) =>
      createOrganization(workspace.db, {
        name: parsed.data.name,
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

  const parsed = parseFormState(inviteOrgMemberInput, formData);
  if (!parsed.ok) return parsed.state;
  const { orgId, githubLogin, role } = parsed.data;

  try {
    await withOrgWrite(({ db }) => {
      if (!canManageOrgMembers(db, orgId, userId)) {
        throw new PublicError("Only org owners and admins can invite members.");
      }
      inviteOrgMember(db, orgId, userId, githubLogin, role);
    });
    refresh();
    return formSuccess(`Invited @${githubLogin} as ${role}.`);
  } catch (error) {
    return actionErrorState(error);
  }
}

export async function removeOrgMemberAction(
  _previous: ActionMessageState,
  formData: FormData,
): Promise<ActionMessageState> {
  return runActionMessage(async () => {
    const { userId } = await requireSignedIn("Sign in to manage organization members.");

    const { orgId, membershipId } = parseForm(orgMembershipInput, formData);

    let revokedInvite = false;
    await withOrgWrite(({ db }) => {
      if (!canManageOrgMembers(db, orgId, userId)) {
        throw new PublicError("Only org owners and admins can remove members.");
      }
      const target = db.memberships.find(
        (membership) =>
          membership.id === membershipId && membership.orgId === orgId,
      );
      revokedInvite = Boolean(target && !target.userId);
      removeOrgMember(db, orgId, userId, membershipId);
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
    const { userId } = await requireSignedIn("Sign in to manage organization members.");

    const { orgId, membershipId, role } = parseForm(
      changeOrgMemberRoleInput,
      formData,
    );

    await withOrgWrite(({ db }) => {
      if (!canManageOrgMembers(db, orgId, userId)) {
        throw new PublicError("Only org owners and admins can change member roles.");
      }
      changeOrgMemberRole(db, orgId, userId, membershipId, role);
    });
    refresh();
    return `Role updated to ${role}.`;
  });
}

export async function exportOrgDataAction(
  orgIdRaw: string,
): Promise<{ error: string | null; json: string | null }> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return { error: "Sign in to export organization data.", json: null };
  }
  try {
    const orgId = parseInput(entityIdSchema, orgIdRaw);
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
    const { userId } = await requireSignedIn("Sign in to delete an organization.");

    const { orgId } = parseForm(deleteOrgInput, formData);

    let nextOrgId: string | undefined;
    await withOrgWrite(({ db }) => {
      deleteOrganization(db, orgId, userId);
      nextOrgId = resolveActiveOrgId(db, userId, null);
    });
    if (nextOrgId) {
      await writeActiveOrgCookie(nextOrgId);
    }
    refresh();
    return "Organization deleted. Evidence history was retained for audit.";
  });
}
