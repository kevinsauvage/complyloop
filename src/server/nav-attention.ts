import { findingsInScope } from "./assessment-status";
import type { Db } from "./db";

export interface NavAttentionCounts {
  openFindings: number;
  unreadAlerts: number;
}

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
