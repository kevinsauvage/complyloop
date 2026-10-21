import { revalidatePath } from "next/cache";

import type { Project } from "@complyloop/analysis-core/contract/project-types";
import { PublicError } from "@complyloop/analysis-core/contract/public-error";

import { getSession } from "@/server/auth-session";

import {
  type AccessContext,
  assertProjectPermission,
} from "../workspace/project-visibility";

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
 * route list from `COMPLIANCE_LOOP_ROUTES` so unrelated (dynamic) pages are
 * not refetched; shell/tenancy mutations keep the layout-wide default.
 */
export function refresh(...paths: string[]): void {
  if (paths.length === 0) {
    revalidatePath("/", "layout");
    return;
  }
  for (const path of new Set(paths)) revalidatePath(path);
}

/**
 * Pre-flight permission check against an already-loaded workspace. The write
 * itself re-authorizes inside `withProjectTx`; this only fails fast before
 * expensive work (a GitHub round-trip) or a network call.
 */
export function requireOnActive(
  workspace: { project: Project | null; access: AccessContext },
  permission: Parameters<typeof assertProjectPermission>[2],
): asserts workspace is { project: Project; access: AccessContext } {
  if (!workspace.project) {
    throw new PublicError("No project connected.");
  }
  assertProjectPermission(workspace.project, workspace.access, permission);
}
