import { revalidatePath } from "next/cache";

import type { Project } from "@complyloop/analysis-core/contract/project-types";
import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import type { ProjectWritePayload } from "@complyloop/db/repo/apply";

import { advanceRemediation } from "@/core/requirements/remediation-lifecycle";
import { getSession } from "@/server/auth-session";

import { assertProjectPermission } from "../workspace/project-visibility";
import type { Workspace } from "../workspace/workspace";

export interface SignedInUser {
  userId: string;
  githubLogin: string | null;
}

/** Throws `PublicError` if not signed in; returns the user id + GitHub login. */
export async function requireSignedIn(
  message = "Sign in to continue.",
): Promise<SignedInUser> {
  const session = await getSession();
  const userId = session?.user?.id;
  if (!userId) throw new PublicError(message);
  return { userId, githubLogin: session?.user?.login ?? null };
}

/**
 * Invalidates the Router Cache for the given routes (or the whole app layout
 * when called with no paths). Triage-loop mutations should pass the narrow
 * route list from `COMPLIANCE_LOOP_ROUTES` so unrelated `force-dynamic` pages
 * are not refetched; shell/tenancy mutations keep the layout-wide default.
 */
export function refresh(...paths: string[]): void {
  if (paths.length === 0) {
    revalidatePath("/", "layout");
    return;
  }
  for (const path of new Set(paths)) revalidatePath(path);
}

export function replaceRemediation(
  payload: ProjectWritePayload,
  updated: ReturnType<typeof advanceRemediation>,
): void {
  payload.remediations = [...(payload.remediations ?? []), updated];
}

export function requireOnActive(
  workspace: Workspace,
  permission: Parameters<typeof assertProjectPermission>[2],
): asserts workspace is Workspace & { project: Project } {
  if (!workspace.project) {
    throw new PublicError("No project connected.");
  }
  assertProjectPermission(workspace.project, workspace.access, permission);
}
