import { revalidatePath } from "next/cache";

import { PublicError } from "@complyloop/analysis-core/contract/public-error";

import { getSession } from "@/server/auth-session";

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
 *
 * Project routes are dynamic (`/projects/[projectId]/…`), and `revalidatePath`
 * requires the `type` argument for a path containing a dynamic segment — that
 * invalidates every project's page, which is the intended blast radius here.
 */
export function refresh(...paths: string[]): void {
  if (paths.length === 0) {
    revalidatePath("/", "layout");
    return;
  }
  for (const path of new Set(paths)) {
    if (path.includes("[")) revalidatePath(path, "page");
    else revalidatePath(path);
  }
}
