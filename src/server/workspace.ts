import { auth } from "@/auth";
import type { Control, Finding, Project, Remediation } from "@/core/types";
import { loadDb, saveDb, type Db } from "./db";
import { ensurePersonalOrg } from "./orgs";
import {
  type AccessContext,
  resolveActiveProject,
  visibleProjects,
} from "./project-visibility";
import { ensureSeeded } from "./seed";

export interface Workspace {
  db: Db;
  project: Project;
  /** Auth.js user id when signed in; null for the unsigned demo. */
  userId: string | null;
  githubLogin: string | null;
  access: AccessContext;
  /** Projects the current viewer may switch between. */
  visibleProjects: Project[];
}

function accessFromDb(
  db: Db,
  userId: string | null,
  githubLogin: string | null,
): AccessContext {
  return {
    userId,
    githubLogin,
    organizations: db.organizations,
    memberships: db.memberships,
  };
}

/** Loads the store, seeding the framework and sample project on first use. */
export async function getWorkspace(): Promise<Workspace> {
  const db = await loadDb();
  if (ensureSeeded(db)) await saveDb(db);

  const session = await auth();
  const userId = session?.user?.id ?? null;
  const githubLogin = session?.user?.login ?? null;

  let changed = false;
  if (userId && githubLogin) {
    const result = ensurePersonalOrg(db, userId, githubLogin);
    if (result.changed) changed = true;
  }

  const access = accessFromDb(db, userId, githubLogin);
  const visible = visibleProjects(db.projects, access);
  const project = resolveActiveProject(
    db.projects,
    db.activeProjectId,
    access,
  );
  if (!project) throw new Error("No projects connected.");

  if (db.activeProjectId !== project.id) {
    db.activeProjectId = project.id;
    changed = true;
  }

  if (changed) await saveDb(db);

  return {
    db,
    project,
    userId,
    githubLogin,
    access,
    visibleProjects: visible,
  };
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
