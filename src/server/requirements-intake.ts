import { presetById } from "@/adapters/registry";
import type { CheckId } from "@/analysis/types";
import type { Control, Framework, Project } from "@/core/project-types";
import { PublicError } from "@/core/public-error";
import { addEvidence, type Db } from "./db";

export const CUSTOM_FRAMEWORK_ID = "fw-custom";

/** Check ids custom controls may link to for automated assessment. */
const KNOWN_CHECK_IDS = new Set<string>([
  "img-alt",
  "button-name",
  "html-lang",
  "positive-tabindex",
  "input-label",
  "anchor-name",
  "heading-order",
  "empty-heading",
  "iframe-title",
  "autoplay-media",
  "duplicate-id",
  "form-error-association",
  "aria-hidden-focusable",
  "aria-role",
  "aria-props",
  "aria-required-attr",
  "no-autofocus",
  "keyboard-interaction",
  "meta-viewport",
  "list-structure",
  "color-contrast",
  "document-title",
  "bypass",
  "landmark-one-main",
  "nested-interactive",
  "target-size",
  "autocomplete-valid",
] satisfies CheckId[]);

function ensureCustomFramework(db: Db): Framework {
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
  /**
   * Optional link to an existing analysis check. When set, assessments use
   * that check's findings; when omitted, the control stays manual
   * (`unable_to_verify` until human pass/exception).
   */
  checkId?: string | null;
}

function resolveCustomCheckId(raw: string | null | undefined): string | null {
  if (raw === undefined || raw === null) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (!KNOWN_CHECK_IDS.has(trimmed)) {
    throw new PublicError(
      `Unknown check id "${trimmed}". Leave blank for a manual control, or use a shipped check id.`,
    );
  }
  return trimmed;
}

/** Adds a control (manual or linked to a check) and puts it in project scope. */
export function importCustomControl(
  db: Db,
  project: Project,
  input: CustomControlInput,
): Control {
  const code = input.code.trim();
  const title = input.title.trim();
  const description = input.description.trim();
  if (!code || !title || !description) {
    throw new PublicError("Code, title, and description are required.");
  }

  const checkId = resolveCustomCheckId(input.checkId);
  ensureCustomFramework(db);
  const control: Control = {
    id: `ctl-custom-${crypto.randomUUID()}`,
    frameworkId: CUSTOM_FRAMEWORK_ID,
    code,
    secondaryCode: input.secondaryCode?.trim() || "Custom",
    title,
    description,
    checkId,
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
    summary: checkId
      ? `Imported custom control ${code}: ${title} (check ${checkId})`
      : `Imported custom control ${code}: ${title}`,
    projectId: project.id,
    controlId: control.id,
    detail: { code, title, checkId },
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
    throw new PublicError("At least one control must remain in scope.");
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

/** Applies a curated framework preset as the project's in-scope controls. */
export function applyFrameworkPreset(
  db: Db,
  project: Project,
  presetId: string,
): void {
  const preset = presetById(presetId);
  if (!preset) throw new PublicError(`Unknown framework preset: ${presetId}`);
  setProjectScope(db, project, preset.controlIds);
  addEvidence(db, {
    kind: "requirements_imported",
    summary: `Applied framework preset "${preset.name}" (${preset.controlIds.length} controls)`,
    projectId: project.id,
    detail: { presetId: preset.id, controlIds: preset.controlIds },
  });
}

export interface ChecklistLine {
  code: string;
  title: string;
  description: string;
  secondaryCode?: string;
  checkId?: string;
}

/**
 * Parses a simple checklist: one control per line as
 * `CODE | Title | Description` (optional 4th `| secondary`, optional 5th `| checkId`).
 */
export function parseChecklistText(text: string): ChecklistLine[] {
  const lines: ChecklistLine[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const parts = line.split("|").map((part) => part.trim());
    if (parts.length < 3) {
      throw new PublicError(
        `Invalid checklist line (need CODE | Title | Description): ${line}`,
      );
    }
    const [code, title, description, secondaryCode, checkId] = parts;
    if (!code || !title || !description) {
      throw new PublicError(`Incomplete checklist line: ${line}`);
    }
    lines.push({ code, title, description, secondaryCode, checkId });
  }
  return lines;
}

/** Imports many custom controls from a pasted checklist. */
export function importChecklist(
  db: Db,
  project: Project,
  text: string,
): Control[] {
  const parsed = parseChecklistText(text);
  if (parsed.length === 0) {
    throw new PublicError("Checklist is empty.");
  }
  return parsed.map((line) =>
    importCustomControl(db, project, {
      code: line.code,
      title: line.title,
      description: line.description,
      secondaryCode: line.secondaryCode,
      checkId: line.checkId,
    }),
  );
}
