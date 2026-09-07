import { revalidatePath } from "next/cache";
import { auth, getGitHubAccessToken } from "@/auth";
import { advanceRemediation } from "@/core/remediation";
import type { Project } from "@complyloop/analysis-core/contract/project-types";
import { type EvidenceRecord, type Finding } from "@complyloop/db/types";
import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import type { ProjectWritePayload } from "@complyloop/db/repo/apply";
import { newEvidenceRecord } from "@complyloop/db/repo/mappers";
import { locateViolationInProject } from "../assessment-findings";
import type { Db } from "../db";
import type { ResolveProjectGitHubTokenOptions } from "../github";
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
  const session = await auth();
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

export function evidenceEntry(
  payload: ProjectWritePayload,
  entry: Omit<EvidenceRecord, "id" | "at">,
): EvidenceRecord {
  const record = newEvidenceRecord(entry);
  payload.evidence = [...(payload.evidence ?? []), record];
  return record;
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
