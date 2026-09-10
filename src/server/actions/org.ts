"use server";

import { z } from "zod";
import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import {
  entityIdSchema,
  parseForm,
  parseInput,
  requiredField,
} from "@/core/boundary";
import {
  publicErrorMessage,
  runActionMessage,
  type ActionMessageState,
} from "../action-state";
import {
  writeActiveOrgCookie,
  writeActiveProjectCookie,
} from "../active-cookies";
import {
  createOrganization,
  deleteOrganization,
  exportOrgData,
} from "../orgs";
import {
  canManageOrgMembers,
  resolveActiveOrgId,
} from "../org-queries";
import {
  changeOrgMemberRole,
  inviteOrgMember,
  removeOrgMember,
} from "../org-membership";
import { getDrizzle } from "@complyloop/db/client";
import { listAssessmentsForProjects } from "@complyloop/db/repo/assessments";
import { listAllEvidenceForProjects } from "@complyloop/db/repo/evidence";
import { getWorkspace } from "../workspace";
import { withOrgWrite } from "../workspace-write";
import { refresh, requireSignedIn } from "./shared";
import { loadProjectRuntime } from "@complyloop/db/workspace-load";
import { emptyDb } from "@complyloop/db/types";

/** Max projects per org export — bounds the O(P) runtime fan-out below. */
const MAX_EXPORT_PROJECTS = 50;
/** Concurrent runtime loads per export chunk — bounds pool pressure. */
const EXPORT_RUNTIME_CONCURRENCY = 5;

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

  const { organizations, projects } = await getWorkspace();
  if (!organizations.some((org) => org.id === orgId)) {
    throw new PublicError("You are not a member of that organization.");
  }
  const projectInOrg = projects.find((project) => project.orgId === orgId);
  await writeActiveOrgCookie(orgId);
  if (projectInOrg) {
    await writeActiveProjectCookie(projectInOrg.id);
  }
  refresh();
}

export async function createOrgAction(
  _previous: ActionMessageState,
  formData: FormData,
): Promise<ActionMessageState> {
  return runActionMessage(async () => {
    const { userId, githubLogin } = await requireSignedIn(
      "Sign in with GitHub to create an organization.",
    );
    if (!githubLogin) {
      throw new PublicError("Sign in with GitHub to create an organization.");
    }
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
    refresh();
    return `Created organization "${org.name}".`;
  });
}

export async function inviteOrgMemberAction(
  _previous: ActionMessageState,
  formData: FormData,
): Promise<ActionMessageState> {
  return runActionMessage(async () => {
    const { userId } = await requireSignedIn(
      "Sign in to manage organization members.",
    );
    const { orgId, githubLogin, role } = parseForm(inviteOrgMemberInput, formData);

    await withOrgWrite(({ db }) => {
      if (!canManageOrgMembers(db, orgId, userId)) {
        throw new PublicError("Only org owners and admins can invite members.");
      }
      const membership = inviteOrgMember(db, orgId, userId, githubLogin, role);
      return { result: undefined, upsertMemberships: [membership] };
    });
    refresh();
    return `Invited @${githubLogin} as ${role}.`;
  });
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
      return { result: undefined, deleteMembershipIds: [membershipId] };
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
      const membership = changeOrgMemberRole(db, orgId, userId, membershipId, role);
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
    const { userId } = await requireSignedIn("Sign in to export organization data.");
    const orgId = parseInput(entityIdSchema, orgIdRaw);
    const { organizations, projects, access } = await getWorkspace();
    const orgProjects = projects.filter((project) => project.orgId === orgId);
    const projectIds = orgProjects.map((project) => project.id);
    // Bound the fan-out: runtime loads are O(P) full history reads. Chunked
    // concurrency keeps pool usage flat; the cap keeps huge orgs from timing
    // out the action (narrow scope or export per project instead).
    if (projectIds.length > MAX_EXPORT_PROJECTS) {
      throw new PublicError(
        `Organization has ${projectIds.length} projects; exports are limited to ${MAX_EXPORT_PROJECTS} projects.`,
        "export_too_large",
      );
    }
    // The workspace slice is bounded (latest assessment, evidence window);
    // the export is the audit artifact, so fetch full history directly.
    const drizzle = await getDrizzle();
    const [evidence, assessments] = await Promise.all([
      listAllEvidenceForProjects(drizzle, projectIds),
      listAssessmentsForProjects(drizzle, projectIds),
    ]);
    const runtimes: Awaited<ReturnType<typeof loadProjectRuntime>>[] = [];
    for (let index = 0; index < projectIds.length; index += EXPORT_RUNTIME_CONCURRENCY) {
      const chunk = projectIds.slice(index, index + EXPORT_RUNTIME_CONCURRENCY);
      runtimes.push(
        ...await Promise.all(chunk.map((projectId) => loadProjectRuntime(drizzle, projectId))),
      );
    }
    const payload = exportOrgData(
      {
        ...emptyDb(),
        organizations,
        memberships: [...access.memberships],
        // Already org-scoped: repo lists + runtimes were loaded for these ids.
        projects: orgProjects,
        findings: runtimes.flatMap((runtime) => runtime.findings),
        remediations: runtimes.flatMap((runtime) => runtime.remediations),
        requirements: runtimes.flatMap((runtime) => runtime.requirements),
        alerts: runtimes.flatMap((runtime) => runtime.alerts),
        assessments,
        evidence,
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
  _previous: ActionMessageState,
  formData: FormData,
): Promise<ActionMessageState> {
  return runActionMessage(async () => {
    const { userId } = await requireSignedIn("Sign in to delete an organization.");

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
    return "Organization deleted. Evidence history was retained for audit.";
  });
}
