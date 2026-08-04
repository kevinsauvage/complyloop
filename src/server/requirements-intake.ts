import type { Control, Framework, Project } from "@/core/types";
import { addEvidence, type Db } from "./db";

export const CUSTOM_FRAMEWORK_ID = "fw-custom";

export function ensureCustomFramework(db: Db): Framework {
  let framework = db.frameworks.find(
    (candidate) => candidate.id === CUSTOM_FRAMEWORK_ID,
  );
  if (!framework) {
    framework = {
      id: CUSTOM_FRAMEWORK_ID,
      name: "Custom checklist",
      version: "1.0",
    };
    db.frameworks.push(framework);
  }
  return framework;
}

export interface CustomControlInput {
  code: string;
  title: string;
  description: string;
  secondaryCode?: string;
}

/** Adds a manual control (no automated check) and puts it in project scope. */
export function importCustomControl(
  db: Db,
  project: Project,
  input: CustomControlInput,
): Control {
  const code = input.code.trim();
  const title = input.title.trim();
  const description = input.description.trim();
  if (!code || !title || !description) {
    throw new Error("Code, title, and description are required.");
  }

  ensureCustomFramework(db);
  const control: Control = {
    id: `ctl-custom-${crypto.randomUUID()}`,
    frameworkId: CUSTOM_FRAMEWORK_ID,
    code,
    secondaryCode: input.secondaryCode?.trim() || "Custom",
    title,
    description,
    checkId: null,
  };
  db.controls.push(control);

  // undefined scope already means every control (including this one).
  if (project.inScopeControlIds) {
    project.inScopeControlIds = [...project.inScopeControlIds, control.id];
  }

  const now = new Date().toISOString();
  db.requirements.push({
    id: crypto.randomUUID(),
    projectId: project.id,
    controlId: control.id,
    status: "unable_to_verify",
    determination: "automated",
    updatedAt: now,
  });

  addEvidence(db, {
    kind: "requirements_imported",
    summary: `Imported custom control ${code}: ${title}`,
    projectId: project.id,
    controlId: control.id,
    detail: { code, title, checkId: null },
  });

  return control;
}

/**
 * Sets which controls are in scope. Passing every known control id clears the
 * explicit list (undefined = all controls).
 */
export function setProjectScope(
  db: Db,
  project: Project,
  controlIds: string[],
): void {
  const known = new Set(db.controls.map((control) => control.id));
  const unique = [...new Set(controlIds)].filter((id) => known.has(id));
  if (unique.length === 0) {
    throw new Error("At least one control must remain in scope.");
  }

  const allIds = db.controls.map((control) => control.id);
  const coversAll =
    unique.length === allIds.length && allIds.every((id) => unique.includes(id));

  project.inScopeControlIds = coversAll ? undefined : unique;

  addEvidence(db, {
    kind: "requirements_imported",
    summary: coversAll
      ? `Project "${project.name}" scope reset to all ${allIds.length} controls`
      : `Project "${project.name}" scope set to ${unique.length} of ${allIds.length} controls`,
    projectId: project.id,
    detail: { inScopeControlIds: project.inScopeControlIds ?? allIds },
  });
}
