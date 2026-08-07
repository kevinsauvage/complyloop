import { rgaaControls, rgaaFramework } from "@/adapters/rgaa/controls";
import type { Project } from "@/core/types";
import type { Db } from "./db";

type LegacyProjectSource = Project["source"] | "sample" | "local" | "git";

function isRetiredNonGitHubProject(project: Project): boolean {
  const source = project.source as LegacyProjectSource;
  return source !== "github";
}

/**
 * Drops retired sample/local/git projects and their scoped records from older
 * stores. Evidence rows are left for audit history.
 */
export function purgeNonGitHubProjects(db: Db): boolean {
  const retiredIds = new Set(
    db.projects
      .filter((project) => isRetiredNonGitHubProject(project))
      .map((project) => project.id),
  );
  if (retiredIds.size === 0) return false;

  db.projects = db.projects.filter((project) => !retiredIds.has(project.id));
  db.requirements = db.requirements.filter(
    (requirement) => !retiredIds.has(requirement.projectId),
  );
  db.assessments = db.assessments.filter(
    (assessment) => !retiredIds.has(assessment.projectId),
  );
  const removedFindingIds = new Set(
    db.findings
      .filter((finding) => retiredIds.has(finding.projectId))
      .map((finding) => finding.id),
  );
  db.findings = db.findings.filter(
    (finding) => !retiredIds.has(finding.projectId),
  );
  db.remediations = db.remediations.filter(
    (remediation) => !removedFindingIds.has(remediation.findingId),
  );
  db.alerts = db.alerts.filter((alert) => !retiredIds.has(alert.projectId));
  if (db.activeProjectId && retiredIds.has(db.activeProjectId)) {
    db.activeProjectId = db.projects[0]?.id ?? null;
  }
  return true;
}

/** Seeds the RGAA framework and controls on first use. */
export function ensureSeeded(db: Db): boolean {
  let changed = purgeNonGitHubProjects(db);

  if (db.frameworks.length === 0) {
    db.frameworks.push(rgaaFramework);
    db.controls.push(...rgaaControls);
    changed = true;
  } else {
    // Pick up newly shipped RGAA controls without wiping custom ones.
    const existingIds = new Set(db.controls.map((control) => control.id));
    for (const control of rgaaControls) {
      if (!existingIds.has(control.id)) {
        db.controls.push(control);
        changed = true;
      } else {
        const existing = db.controls.find(
          (candidate) => candidate.id === control.id,
        );
        if (
          existing &&
          control.complianceWeight !== undefined &&
          existing.complianceWeight !== control.complianceWeight
        ) {
          existing.complianceWeight = control.complianceWeight;
          changed = true;
        }
      }
    }
    if (!db.frameworks.some((framework) => framework.id === rgaaFramework.id)) {
      db.frameworks.push(rgaaFramework);
      changed = true;
    }
  }

  if (db.projects.length > 0 && !db.activeProjectId) {
    db.activeProjectId = db.projects[0].id;
    changed = true;
  }

  return changed;
}
