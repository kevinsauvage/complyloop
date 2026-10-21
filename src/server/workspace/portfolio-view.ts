/** Projects portfolio loader — data-shaping for the `(app)/projects` route (no JSX here). */
import "server-only";

import type { Project } from "@complyloop/analysis-core/contract/project-types";
import { getDrizzle } from "@complyloop/db/postgres";
import {
  listPortfolioForProjects,
  type PortfolioProjectRow,
} from "@complyloop/db/repo/portfolio";

import { projectCapabilities } from "./project-capabilities";
import { scopedControlIds } from "./project-scope";
import { visibleProjects } from "./project-visibility";
import { getWorkspace } from "./workspace";

export interface PortfolioRow extends PortfolioProjectRow {
  project: Project;
  /** Requirement verdicts a human still has to act on (failed + needs_review). */
  attention: number;
}

export interface PortfolioView {
  org: { id: string; name: string } | null;
  rows: PortfolioRow[];
  /** Whether this viewer may connect a repository (= create a project). */
  canCreateProject: boolean;
}

/**
 * Cross-project compliance state for the active org: one row per visible
 * project, newest-first by urgency. Costs a fixed number of grouped queries —
 * never a runtime load per project.
 */
export async function loadPortfolioView(): Promise<PortfolioView> {
  const { projects, access, activeOrgId, organizations } = await getWorkspace();
  const org = activeOrgId
    ? organizations.find((candidate) => candidate.id === activeOrgId)
    : undefined;
  if (!org) return { org: null, rows: [], canCreateProject: false };
  const canCreateProject = projectCapabilities(
    null,
    access,
    activeOrgId,
  ).canConnect;

  const inOrg = visibleProjects(
    projects.filter((project) => project.orgId === org.id),
    access,
  );
  if (inOrg.length === 0) {
    return {
      org: { id: org.id, name: org.name },
      rows: [],
      canCreateProject,
    };
  }
  const scopes = new Map<string, ReadonlySet<string>>();
  for (const project of inOrg) {
    const scoped = scopedControlIds(project);
    if (scoped) scopes.set(project.id, scoped);
  }
  const portfolio = await listPortfolioForProjects(
    await getDrizzle(),
    inOrg.map((project) => project.id),
    scopes,
  );

  const rows: PortfolioRow[] = inOrg.map((project) => {
    const counts = portfolio.find((row) => row.projectId === project.id);
    if (!counts) {
      throw new Error(
        `Portfolio row missing for project ${project.id} — the grouped query must return one row per requested id.`,
      );
    }
    return {
      ...counts,
      project,
      attention: counts.requirements.failed + counts.requirements.needs_review,
    };
  });

  // Urgency first: what a lead has to act on, then never-assessed staleness,
  // then name for a stable, predictable table.
  rows.sort(
    (a, b) =>
      b.attention - a.attention ||
      b.openViolations - a.openViolations ||
      b.unreadAlerts - a.unreadAlerts ||
      (a.lastCompletedAt ?? "").localeCompare(b.lastCompletedAt ?? "") ||
      a.project.name.localeCompare(b.project.name),
  );

  return { org: { id: org.id, name: org.name }, rows, canCreateProject };
}
