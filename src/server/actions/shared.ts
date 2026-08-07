import { revalidatePath } from "next/cache";
import { advanceRemediation } from "@/core/remediation";
import type { Finding } from "@/core/types";
import { locateViolationInProject } from "../assessment-helpers";
import type { Db } from "../db";
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
): void {
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
  if (!project) throw new Error(`Unknown project: ${finding.projectId}`);
  assertProjectPermission(project, workspace.access, permission);
}

export function locateViolation(db: Db, finding: Finding) {
  const project = db.projects.find((candidate) => candidate.id === finding.projectId);
  if (!project) throw new Error(`Unknown project: ${finding.projectId}`);
  return {
    project,
    match: locateViolationInProject(project, finding),
  };
}
