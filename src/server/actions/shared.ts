import { revalidatePath } from "next/cache";
import { getSession } from "@/server/auth-session";
import { advanceRemediation } from "@/core/lifecycle";
import type { Project } from "@complyloop/analysis-core/contract/project-types";
import { type Finding } from "@complyloop/db/types";
import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import type { ProjectWritePayload } from "@complyloop/db/repo/apply";
import { assertProjectPermission } from "../project-visibility";
import type { Workspace } from "../workspace";

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

export function refresh(): void {
  revalidatePath("/", "layout");
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

export function requireOnFindingProject(
  workspace: Workspace,
  finding: Finding,
  permission: Parameters<typeof assertProjectPermission>[2],
): Project {
  const project = workspace.projects.find(
    (candidate) => candidate.id === finding.projectId,
  );
  if (!project) throw new PublicError("Unknown project.");
  assertProjectPermission(project, workspace.access, permission);
  return project;
}

/** Preview-load + permission + project resolve for finding actions. */
export function requireFindingContext(
  workspace: Workspace,
  finding: Finding,
  permission: Parameters<typeof assertProjectPermission>[2],
): { finding: Finding; project: Project } {
  const project = requireOnFindingProject(workspace, finding, permission);
  return { finding, project };
}
