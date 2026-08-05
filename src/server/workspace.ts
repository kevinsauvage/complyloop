import { auth } from "@/auth";
import type { Control, Finding, Project, Remediation } from "@/core/types";
import { loadDb, saveDb, type Db } from "./db";
import { resolveActiveProject, visibleProjects } from "./project-visibility";
import { ensureSeeded } from "./seed";

export interface Workspace {
  db: Db;
  project: Project;
  /** Auth.js user id when signed in; null for the unsigned demo. */
  userId: string | null;
  /** Projects the current viewer may switch between. */
  visibleProjects: Project[];
}

/** Loads the store, seeding the framework and sample project on first use. */
export async function getWorkspace(): Promise<Workspace> {
  const db = await loadDb();
  if (ensureSeeded(db)) await saveDb(db);

  const session = await auth();
  const userId = session?.user?.id ?? null;
  const visible = visibleProjects(db.projects, userId);
  const project = resolveActiveProject(db.projects, db.activeProjectId, userId);
  if (!project) throw new Error("No projects connected.");

  if (db.activeProjectId !== project.id) {
    db.activeProjectId = project.id;
    await saveDb(db);
  }

  return { db, project, userId, visibleProjects: visible };
}

export function controlById(db: Db, controlId: string): Control {
  const control = db.controls.find((candidate) => candidate.id === controlId);
  if (!control) throw new Error(`Unknown control: ${controlId}`);
  return control;
}

export function findingById(db: Db, findingId: string): Finding {
  const finding = db.findings.find((candidate) => candidate.id === findingId);
  if (!finding) throw new Error(`Unknown finding: ${findingId}`);
  return finding;
}

export function remediationForFinding(db: Db, findingId: string): Remediation {
  const remediation = db.remediations.find(
    (candidate) => candidate.findingId === findingId,
  );
  if (!remediation) throw new Error(`No remediation for finding: ${findingId}`);
  return remediation;
}
