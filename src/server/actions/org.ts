"use server";

import { z } from "zod";

import { ORG_ROLES } from "@complyloop/analysis-core/contract/project-types";
import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import { emptyWorkspaceSlice } from "@complyloop/db/types";

import type { ActionState } from "@/core/action-state";
import { parseEntityId, parseForm, requiredField } from "@/core/validate";

import { publicErrorMessage, runAction } from "../action-state";
import { getGitHubAccessToken } from "../github/access-token";
import { lookupGitHubUser } from "../github/github";
import {
  assertExportRateLimit,
  assertOrgCreateRateLimit,
  assertOrgInviteRateLimit,
} from "../rate-limit";
import {
  clearActiveProjectCookie,
  readActiveOrgCookie,
  writeActiveOrgCookie,
  writeActiveProjectCookie,
} from "../workspace/active-cookies";
import {
  changeOrgMemberRole,
  findOrgMembershipByLogin,
  inviteOrgMember,
  leaveOrgMember,
  removeOrgMember,
} from "../workspace/org-membership";
import { resolveActiveOrgId } from "../workspace/org-queries";
import {
  createOrganization,
  deleteOrganization,
  exportOrgData,
  loadOrgExportData,
} from "../workspace/orgs";
import { getWorkspace } from "../workspace/workspace";
import { withOrgWrite } from "../workspace/workspace-write";
import { refresh, requireSignedIn } from "./shared";

/** Roles assignable via invite/change UI (owner transfer unsupported). Single source: ORG_ROLES. */
const ASSIGNABLE_ORG_ROLES = ORG_ROLES.filter(
  (role): role is "admin" | "member" | "viewer" => role !== "owner",
);

/** Max projects per org export — bounds the export payload. */
const MAX_EXPORT_PROJECTS = 50;

const switchOrgInput = z.object({
  orgId: requiredField("An organization id is required."),
});

const createOrgInput = z.object({
  name: requiredField("Enter an organization name.", 200),
});

const inviteOrgMemberInput = z.object({
  orgId: requiredField("Select an organization."),
  githubLogin: requiredField("Enter a GitHub username.", 39),
  role: z.enum(ASSIGNABLE_ORG_ROLES, {
    error: "Choose a role: admin, member, or viewer.",
  }),
});

const orgMembershipInput = z.object({
  orgId: requiredField("Organization id is required."),
  membershipId: requiredField("Membership id is required."),
});

const changeOrgMemberRoleInput = orgMembershipInput.extend({
  role: z.enum(ASSIGNABLE_ORG_ROLES, {
    error: "Choose a role: admin, member, or viewer.",
  }),
});

const deleteOrgInput = orgMembershipInput.pick({ orgId: true }).extend({
  confirm: z.literal("DELETE", {
    error: "Type DELETE to confirm organization deletion.",
  }),
});

export async function switchOrgAction(formData: FormData): Promise<void> {
  const { orgId } = parseForm(switchOrgInput, formData);
  await requireSignedIn("Sign in to switch organizations.");

  const { organizations, projects } = await getWorkspace();
  if (!organizations.some((org) => org.id === orgId)) {
    throw new PublicError("You are not a member of that organization.");
  }
  const projectInOrg = projects.find((project) => project.orgId === orgId);
  await writeActiveOrgCookie(orgId);
  if (projectInOrg) {
    await writeActiveProjectCookie(projectInOrg.id);
  } else {
    await clearActiveProjectCookie();
  }
  refresh();
}

export async function createOrgAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const { userId, githubLogin } = await requireSignedIn(
      "Sign in with GitHub to create an organization.",
    );
    if (!githubLogin) {
      throw new PublicError("Sign in with GitHub to create an organization.");
    }
    await assertOrgCreateRateLimit(userId);
    const { name } = parseForm(createOrgInput, formData);

    const org = await withOrgWrite((workspace) => {
      const { org: created, membership } = createOrganization(workspace.db, {
        name,
        creatorUserId: userId,
        githubLogin,
      });
      return {
        result: created,
        insertOrgs: [created],
        upsertMemberships: [membership],
      };
    });
    await writeActiveOrgCookie(org.id);
    await clearActiveProjectCookie();
    refresh();
    return `Created organization "${org.name}".`;
  });
}

export async function inviteOrgMemberAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const { userId } = await requireSignedIn(
      "Sign in to manage organization members.",
    );
    const { orgId, githubLogin, role } = parseForm(
      inviteOrgMemberInput,
      formData,
    );
    await assertOrgInviteRateLimit(userId);

    // Typo guard: verify the login exists when the inviter has a token.
    // Unverifiable (GitHub outage) proceeds as before — never block a
    // legitimate invite on a transient lookup failure.
    const inviterToken = await getGitHubAccessToken();
    let unverified = false;
    if (inviterToken) {
      const lookup = await lookupGitHubUser(inviterToken, githubLogin);
      if (lookup.status === "not-found") {
        throw new PublicError(
          `No GitHub user "@${githubLogin.trim().replace(/^@/, "")}" — check the spelling.`,
        );
      }
      unverified = lookup.status === "unverifiable";
    }

    const { membership, isNew } = await withOrgWrite(({ db }) => {
      const preExisting = findOrgMembershipByLogin(db, orgId, githubLogin);
      const invited = inviteOrgMember(db, orgId, userId, githubLogin, role);
      return {
        result: { membership: invited, isNew: !preExisting },
        upsertMemberships: [invited],
      };
    });
    refresh();
    if (!isNew) {
      return `Updated @${membership.githubLogin} role to ${role}.`;
    }
    return unverified
      ? `Invited @${membership.githubLogin} as ${role} (GitHub lookup unavailable — invite created unverified).`
      : `Invited @${membership.githubLogin} as ${role}.`;
  });
}

export async function removeOrgMemberAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const { userId } = await requireSignedIn(
      "Sign in to manage organization members.",
    );

    const { orgId, membershipId } = parseForm(orgMembershipInput, formData);

    let revokedInvite = false;
    await withOrgWrite(({ db }) => {
      const target = db.memberships.find(
        (membership) =>
          membership.id === membershipId && membership.orgId === orgId,
      );
      revokedInvite = Boolean(target && !target.userId);
      removeOrgMember(db, orgId, userId, membershipId);
      return { result: undefined, deleteMembershipIds: [membershipId] };
    });
    refresh();
    return revokedInvite ? "Invite revoked." : "Member removed.";
  });
}

/**
 * Self-leave: any member may remove their own membership (no membershipId —
 * the target is always the caller, so there is nothing to forge). Active
 * cookies self-heal via `resolveActiveOrgId`/`resolveActiveProject`, but the
 * project cookie is cleared when leaving the active org so no page keeps
 * rendering a project the user can no longer see.
 */
export async function leaveOrgMemberAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const { userId } = await requireSignedIn(
      "Sign in to leave an organization.",
    );
    const { orgId } = parseForm(orgMembershipInput.pick({ orgId: true }), formData);

    await withOrgWrite(({ db }) => {
      const left = leaveOrgMember(db, orgId, userId);
      return {
        result: undefined,
        deleteMembershipIds: [left.removedMembershipId],
      };
    });
    if ((await readActiveOrgCookie()) === orgId) {
      await clearActiveProjectCookie();
    }
    refresh();
    return "You left the organization.";
  });
}

export async function changeOrgMemberRoleAction(  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const { userId } = await requireSignedIn(
      "Sign in to manage organization members.",
    );

    const { orgId, membershipId, role } = parseForm(
      changeOrgMemberRoleInput,
      formData,
    );

    await withOrgWrite(({ db }) => {
      const membership = changeOrgMemberRole(
        db,
        orgId,
        userId,
        membershipId,
        role,
      );
      return { result: undefined, upsertMemberships: [membership] };
    });
    refresh();
    return `Role updated to ${role}.`;
  });
}

export async function exportOrgDataAction(
  orgIdRaw: string,
): Promise<{ error: string | null; json: string | null }> {
  try {
    const { userId } = await requireSignedIn(
      "Sign in to export organization data.",
    );
    await assertExportRateLimit(userId);
    const orgId = parseEntityId(orgIdRaw);
    const { organizations, projects, access } = await getWorkspace();
    const orgProjects = projects.filter((project) => project.orgId === orgId);
    const projectIds = orgProjects.map((project) => project.id);
    // Bound the fan-out: runtime loads are O(P) full history reads. Chunked
    // concurrency keeps pool usage flat; the cap keeps huge orgs from timing
    // out the action. Fallback is per-project export: every project has an
    // Evidence → Export button hitting GET /evidence/export (see
    // src/app/(app)/evidence/export/route.ts), so no data is unreachable.
    if (projectIds.length > MAX_EXPORT_PROJECTS) {
      throw new PublicError(
        `Organization has ${projectIds.length} projects; exports are limited to ${MAX_EXPORT_PROJECTS} projects. Export each project separately from its Evidence page (Export downloads /evidence/export for that project).`,
        "export_too_large",
      );
    }
    // The workspace slice is bounded (latest assessment, evidence window);
    // the export is the audit artifact, so full history loads via the
    // workspace export loader (one set-based query per entity type).
    const history = await loadOrgExportData(projectIds);
    const payload = exportOrgData(
      {
        ...emptyWorkspaceSlice(),
        organizations,
        memberships: [...access.memberships],
        // Already org-scoped: repo lists were loaded for these ids.
        projects: orgProjects,
        ...history,
      },
      orgId,
      userId,
    );
    return { error: null, json: JSON.stringify(payload, null, 2) };
  } catch (error) {
    return {
      error: publicErrorMessage(error),
      json: null,
    };
  }
}

export async function deleteOrgAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const { userId } = await requireSignedIn(
      "Sign in to delete an organization.",
    );

    const { orgId } = parseForm(deleteOrgInput, formData);

    let nextOrgId: string | undefined;
    await withOrgWrite(({ db }) => {
      const { deleteMembershipIds } = deleteOrganization(db, orgId, userId);
      nextOrgId = resolveActiveOrgId(
        {
          organizations: db.organizations.filter((org) => org.id !== orgId),
          memberships: db.memberships.filter(
            (membership) => membership.orgId !== orgId,
          ),
        },
        userId,
        null,
      );
      return {
        result: undefined,
        deleteOrgIds: [orgId],
        deleteMembershipIds,
      };
    });
    if (nextOrgId) {
      await writeActiveOrgCookie(nextOrgId);
    }
    refresh();
    return "Organization deleted, including its evidence history.";
  });
}
