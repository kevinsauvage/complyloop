import fs from "node:fs";
import path from "node:path";
import { rgaaControls, rgaaFramework } from "@/adapters/rgaa/controls";
import type { Project } from "@/core/types";
import { addEvidence, workspacesDir, type Db } from "./db";

export const SAMPLE_PROJECT_NAME = "sample-shop";

function fixtureSourceDir(): string {
  return path.join(process.cwd(), "fixtures", SAMPLE_PROJECT_NAME);
}

/**
 * The sample project is assessed (and fixed) inside a workspace copy so the
 * committed fixtures stay pristine and the demo can be reset at any time.
 */
export function resetSampleWorkspace(project: Project): void {
  if (project.source !== "sample") {
    throw new Error(`Only sample projects can be reset (got source=${project.source}).`);
  }
  fs.rmSync(project.rootPath, { recursive: true, force: true });
  fs.cpSync(fixtureSourceDir(), project.rootPath, { recursive: true });
}

/** Seeds the framework, controls, and sample project on first use. */
export function ensureSeeded(db: Db): boolean {
  let changed = false;

  if (db.frameworks.length === 0) {
    db.frameworks.push(rgaaFramework);
    db.controls.push(...rgaaControls);
    changed = true;
  }

  if (db.projects.length === 0) {
    const project: Project = {
      id: crypto.randomUUID(),
      name: SAMPLE_PROJECT_NAME,
      rootPath: path.join(workspacesDir(), SAMPLE_PROJECT_NAME),
      source: "sample",
      createdAt: new Date().toISOString(),
    };
    resetSampleWorkspace(project);
    db.projects.push(project);
    db.activeProjectId = project.id;
    addEvidence(db, {
      kind: "project_connected",
      summary: `Connected sample project "${project.name}"`,
      projectId: project.id,
      detail: { source: "sample" },
    });
    changed = true;
  } else if (!db.activeProjectId) {
    db.activeProjectId = db.projects[0].id;
    changed = true;
  }

  return changed;
}
