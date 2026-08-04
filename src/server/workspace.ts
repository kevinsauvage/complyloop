import type { Control, Finding, Project, Remediation } from "@/core/types";
import { loadDb, saveDb, type Db } from "./db";
import { ensureSeeded } from "./seed";

export interface Workspace {
  db: Db;
  project: Project;
}

/** Loads the store, seeding the framework and sample project on first use. */
export function getWorkspace(): Workspace {
  const db = loadDb();
  if (ensureSeeded(db)) saveDb(db);
  const project = db.projects[0];
  return { db, project };
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
