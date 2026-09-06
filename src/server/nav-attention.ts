import type { Project } from "@complyloop/analysis-core/contract/project-types";
import { getDrizzle } from "@complyloop/db/client";
import {
  countNavAttentionForProject,
  type NavAttentionCounts,
} from "@complyloop/db/queries";
import { findingsInScope, scopedControlIds } from "./assessment-status";
import type { Db } from "./db";

export type { NavAttentionCounts };

export function navAttentionCounts(db: Db, projectId: string): NavAttentionCounts {
  const project = db.projects.find((candidate) => candidate.id === projectId);
  if (!project) {
    return { openFindings: 0, unreadAlerts: 0 };
  }

  const openFindings = findingsInScope(db.findings, project).filter(
    (finding) => finding.status === "open",
  ).length;
  const unreadAlerts = db.alerts.filter(
    (alert) => alert.projectId === projectId && !alert.read,
  ).length;

  return { openFindings, unreadAlerts };
}

/** Nav badges without hydrating the full findings/alerts arrays. */
export async function navAttentionForProject(
  project: Project,
): Promise<NavAttentionCounts> {
  const controlIds = scopedControlIds(project);
  return countNavAttentionForProject(
    await getDrizzle(),
    project.id,
    controlIds ? [...controlIds] : undefined,
  );
}
