"use server";

import { PublicError } from "@/core/public-error";
import {
  runActionMessage,
  type ActionMessageState,
} from "../action-state";
import {
  applyFrameworkPreset,
  importChecklist,
  importCustomControl,
  setProjectScope,
} from "../requirements-intake";
import { withWorkspaceWrite } from "../workspace";
import { refresh, requireOnActive } from "./shared";

export async function updateRequirementScopeAction(
  _previous: ActionMessageState,
  formData: FormData,
): Promise<ActionMessageState> {
  return runActionMessage(async () => {
    await withWorkspaceWrite(async (workspace) => {
      requireOnActive(workspace, "project.assess");
      const { db, project } = workspace;
      const selected = formData
        .getAll("controlId")
        .filter((value): value is string => typeof value === "string");
      setProjectScope(db, project, selected);
    });
    refresh();
    return "Scope saved.";
  });
}

export async function importCustomControlAction(
  _previous: ActionMessageState,
  formData: FormData,
): Promise<ActionMessageState> {
  return runActionMessage(async () => {
    await withWorkspaceWrite(async (workspace) => {
      requireOnActive(workspace, "project.assess");
      const { db, project } = workspace;
      const code = formData.get("code");
      const title = formData.get("title");
      const description = formData.get("description");
      const secondaryCode = formData.get("secondaryCode");
      if (
        typeof code !== "string" ||
        typeof title !== "string" ||
        typeof description !== "string"
      ) {
        throw new PublicError("Code, title, and description are required.");
      }
      const checkId = formData.get("checkId");
      importCustomControl(db, project, {
        code,
        title,
        description,
        secondaryCode:
          typeof secondaryCode === "string" ? secondaryCode : undefined,
        checkId: typeof checkId === "string" ? checkId : undefined,
      });
    });
    refresh();
    return "Control imported.";
  });
}

export async function applyFrameworkPresetAction(
  _previous: ActionMessageState,
  formData: FormData,
): Promise<ActionMessageState> {
  return runActionMessage(async () => {
    const presetId = formData.get("presetId");
    if (typeof presetId !== "string" || presetId.length === 0) {
      throw new PublicError("A framework preset is required.");
    }
    let added = 0;
    await withWorkspaceWrite(async (workspace) => {
      requireOnActive(workspace, "project.assess");
      const { db, project } = workspace;
      added = applyFrameworkPreset(db, project, presetId).added;
    });
    refresh();
    return added > 0
      ? "Preset applied."
      : "Preset controls were already in scope — nothing changed.";
  });
}

export async function importChecklistAction(
  _previous: ActionMessageState,
  formData: FormData,
): Promise<ActionMessageState> {
  return runActionMessage(async () => {
    const checklist = formData.get("checklist");
    if (typeof checklist !== "string" || checklist.trim().length === 0) {
      throw new PublicError("Paste a checklist to import.");
    }
    await withWorkspaceWrite(async (workspace) => {
      requireOnActive(workspace, "project.assess");
      const { db, project } = workspace;
      importChecklist(db, project, checklist);
    });
    refresh();
    return "Checklist imported.";
  });
}

