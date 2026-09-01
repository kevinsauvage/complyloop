import { revalidatePath } from "next/cache";
import { getGitHubAccessToken } from "@/auth";
import { advanceRemediation } from "@/core/remediation";
import type { Project } from "@/core/project-types";
import type { Finding } from "@/core/finding-types";
import { PublicError } from "@/core/public-error";
import { locateViolationInProject } from "../assessment-helpers";
import type { Db } from "../db";
import type { ResolveProjectGitHubTokenOptions } from "../github-access";
import { assertProjectPermission } from "../project-visibility";
import type { Workspace } from "../workspace";

export function refresh(): void {
  revalidatePath("/", "layout");
}

export function replaceRemediation(
  db: Db,
  updated: ReturnType<typeof advanceRemediation>,
): void {
  const index = db.remediations.findIndex((candidate) => candidate.id === updated.id);
  db.remediations[index] = updated;
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
): void {
  const project = workspace.db.projects.find(
    (candidate) => candidate.id === finding.projectId,
  );
  if (!project) throw new PublicError("Unknown project.");
  assertProjectPermission(project, workspace.access, permission);
}

export function locateViolation(
  db: Db,
  finding: Finding,
  rootPath: string,
) {
  const project = db.projects.find((candidate) => candidate.id === finding.projectId);
  if (!project) throw new PublicError("Unknown project.");
  return {
    project,
    match: locateViolationInProject(rootPath, finding),
  };
}

/** Session token options for ephemeral GitHub checkouts. */
export async function sessionCheckoutTokenOptions(): Promise<ResolveProjectGitHubTokenOptions> {
  return {
    sessionAccessToken: await getGitHubAccessToken(),
  };
}
